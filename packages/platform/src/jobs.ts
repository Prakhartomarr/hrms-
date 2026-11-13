import { randomUUID } from 'node:crypto';
import { DelayedError, Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { currentContext, runWithContext } from './context.js';
import type { Logger } from './logger.js';
import { createRedis } from './redis.js';

/** What travels in Redis for every job: the payload plus the context to restore. */
export interface JobEnvelope<P = unknown> {
  tenantId: string | null;
  userId?: string;
  requestId: string;
  payload: P;
}

export interface JobMeta {
  jobId: string;
  name: string;
  attempt: number;
  tenantId: string | null;
  /** Report progress (0-100 or a JSON object). */
  progress(value: number | object): Promise<void>;
}

/** A runnable job as the bus sees it (modules declare these via defineModule). */
export interface RegisteredJob {
  /** Fully qualified: `<module>.<job>`. */
  name: string;
  queue: string;
  attempts: number;
  backoffMs: number;
  /** Max concurrent jobs of this queue per tenant (noisy-neighbour guard). */
  tenantConcurrency?: number;
  handler(payload: unknown, meta: JobMeta): Promise<unknown>;
}

export interface EnqueueOptions {
  /** Dedupe key: a job with the same id is not added twice while it exists. */
  jobId?: string;
  delayMs?: number;
  /** Override the tenant (defaults to the current context's tenant). */
  tenantId?: string | null;
}

export interface JobBusOptions {
  redisUrl: string;
  prefix: string;
  logger: Logger;
  defaultTenantConcurrency: number;
}

// Counting semaphore with lease expiry: KEYS[1]=zset, ARGV: member, limit, now, leaseMs
const ACQUIRE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  redis.call('ZADD', KEYS[1], ARGV[3] + ARGV[4], ARGV[1]) return 1 end
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[2]) then
  redis.call('ZADD', KEYS[1], ARGV[3] + ARGV[4], ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ARGV[4])
  return 1
end
return 0`;

const LEASE_MS = 15 * 60_000;

/**
 * BullMQ wrapper: named jobs routed to queues, the execution context restored around every
 * handler, and per-tenant concurrency limits enforced with a Redis semaphore.
 */
export class JobBus {
  private readonly jobs = new Map<string, RegisteredJob>();
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly redis: Redis;

  constructor(private readonly opts: JobBusOptions) {
    this.redis = createRedis(opts.redisUrl, { forBullmq: true, name: 'jobbus' });
  }

  register(job: RegisteredJob): void {
    if (this.jobs.has(job.name)) throw new Error(`Job ${job.name} registered twice`);
    this.jobs.set(job.name, job);
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }

  definitions(): RegisteredJob[] {
    return [...this.jobs.values()];
  }

  queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis, prefix: this.opts.prefix });
      this.queues.set(name, q);
    }
    return q;
  }

  private def(name: string): RegisteredJob {
    const def = this.jobs.get(name);
    if (!def) throw new Error(`Unknown job: ${name}`);
    return def;
  }

  private envelope<P>(payload: P, tenantId?: string | null): JobEnvelope<P> {
    const ctx = currentContext();
    return {
      tenantId: tenantId === undefined ? (ctx?.tenantId ?? null) : tenantId,
      ...(ctx?.userId ? { userId: ctx.userId } : {}),
      requestId: ctx?.requestId ?? randomUUID(),
      payload,
    };
  }

  /** Queue a job by name. Tenant and request ids are taken from the current context. */
  async enqueue<P>(name: string, payload: P, opts: EnqueueOptions = {}): Promise<string> {
    const def = this.def(name);
    const jobOpts: JobsOptions = {
      attempts: def.attempts,
      backoff: { type: 'exponential', delay: def.backoffMs },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
      ...(opts.delayMs ? { delay: opts.delayMs } : {}),
    };
    const job = await this.queue(def.queue).add(
      name,
      this.envelope(payload, opts.tenantId),
      jobOpts,
    );
    return job.id ?? '';
  }

  /** Where a job is: 'unknown' when no job has this id. A dead job is 'failed' or 'unknown'. */
  async state(name: string, jobId: string): Promise<string> {
    return this.queue(this.def(name).queue).getJobState(jobId);
  }

  /** Repeatable job (scheduler role). Idempotent per schedule id. */
  async schedule(
    id: string,
    name: string,
    repeat: { everyMs?: number; cron?: string },
    payload: unknown = {},
  ): Promise<void> {
    const def = this.def(name);
    await this.queue(def.queue).upsertJobScheduler(
      id,
      repeat.cron ? { pattern: repeat.cron } : { every: repeat.everyMs ?? 60_000 },
      {
        name,
        data: { tenantId: null, requestId: `schedule:${id}`, payload } satisfies JobEnvelope,
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }

  /** Runs a job handler in-process (scripts, tests, seed). Same context handling as a worker. */
  async runInline<P>(name: string, payload: P, tenantId?: string | null): Promise<unknown> {
    const def = this.def(name);
    const env = this.envelope(payload, tenantId);
    const jobId = `inline:${randomUUID()}`;
    return runWithContext(this.ctxFor(env, jobId, name), () =>
      def.handler(env.payload, {
        jobId,
        name,
        attempt: 1,
        tenantId: env.tenantId,
        progress: async () => {},
      }),
    );
  }

  private ctxFor(env: JobEnvelope, jobId: string, name: string) {
    return {
      requestId: env.requestId,
      jobId,
      jobName: name,
      ...(env.tenantId ? { tenantId: env.tenantId } : {}),
      ...(env.userId ? { userId: env.userId } : {}),
    };
  }

  /** Starts one BullMQ worker per queue that has registered jobs. */
  start(concurrency: number, queues?: string[]): void {
    const names = new Set(this.definitions().map((d) => d.queue));
    for (const queueName of names) {
      if (queues && !queues.includes(queueName)) continue;
      const worker = new Worker(
        queueName,
        async (job: Job<JobEnvelope>, token?: string) => this.process(job, token),
        { connection: this.redis.duplicate(), prefix: this.opts.prefix, concurrency },
      );
      worker.on('failed', (job, err) =>
        this.opts.logger.error({ err, jobId: job?.id, job: job?.name }, 'job failed'),
      );
      worker.on('error', (err) => this.opts.logger.error({ err }, 'worker error'));
      this.workers.push(worker);
    }
  }

  private async process(job: Job<JobEnvelope>, token?: string): Promise<unknown> {
    const def = this.def(job.name);
    const env = job.data;
    const jobId = job.id ?? randomUUID();
    let semKey: string | undefined;
    if (env.tenantId) {
      const limit = def.tenantConcurrency ?? this.opts.defaultTenantConcurrency;
      semKey = `${this.opts.prefix}:sem:${def.queue}:${env.tenantId}`;
      const ok = await this.redis.eval(ACQUIRE, 1, semKey, jobId, limit, Date.now(), LEASE_MS);
      if (ok !== 1) {
        // Tenant is at its limit: push back without consuming an attempt.
        await job.moveToDelayed(Date.now() + 500 + Math.floor(Math.random() * 1000), token);
        throw new DelayedError();
      }
    }
    try {
      return await runWithContext(this.ctxFor(env, jobId, job.name), () =>
        def.handler(env.payload, {
          jobId,
          name: job.name,
          attempt: job.attemptsMade + 1,
          tenantId: env.tenantId,
          progress: (v) => job.updateProgress(v),
        }),
      );
    } finally {
      if (semKey) await this.redis.zrem(semKey, jobId);
    }
  }

  /** Graceful stop: workers finish their active jobs, then connections close. */
  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.redis.disconnect();
  }
}
