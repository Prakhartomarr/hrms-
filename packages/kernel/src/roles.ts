import { buildApi } from './api.js';
import { createRuntime, PLATFORM_JOBS, type Runtime } from './runtime.js';

/** api role: HTTP server. */
export async function startApi(): Promise<Runtime> {
  const rt = await createRuntime({ role: 'api' });
  const app = await buildApi(rt);
  rt.shutdown.add('http', () => app.close()); // runs first: stop accepting requests
  rt.shutdown.listen();
  await app.listen({ host: rt.config.API_HOST, port: rt.config.API_PORT });
  return rt;
}

/** worker role: processes every queue. Shutdown waits for active jobs to finish. */
export async function startWorker(rt?: Runtime, queues?: string[]): Promise<Runtime> {
  const runtime = rt ?? (await createRuntime({ role: 'worker' }));
  runtime.jobs.start(runtime.config.WORKER_CONCURRENCY, queues);
  if (!rt) runtime.shutdown.listen();
  runtime.logger.info({ jobs: runtime.jobs.definitions().map((d) => d.name) }, 'worker started');
  return runtime;
}

/** Registers repeatable jobs: the outbox relay plus every module schedule. Idempotent. */
export async function registerSchedules(rt: Runtime): Promise<string[]> {
  const ids: string[] = [];
  await rt.jobs.schedule('platform.outbox-relay', PLATFORM_JOBS.outboxRelay, { everyMs: 1000 });
  ids.push('platform.outbox-relay');
  for (const m of rt.modules) {
    for (const s of m.definition.schedules ?? []) {
      const job = s.job.includes('.') ? s.job : `${m.definition.id}.${s.job}`;
      const id = `${m.definition.id}.${s.id}`;
      await rt.jobs.schedule(id, job, { ...(s.everyMs ? { everyMs: s.everyMs } : {}), ...(s.cron ? { cron: s.cron } : {}) }, s.payload ?? {});
      ids.push(id);
    }
  }
  return ids;
}

/** scheduler role: owns repeatable job definitions; they fire on workers. */
export async function startScheduler(): Promise<Runtime> {
  const rt = await createRuntime({ role: 'scheduler' });
  const ids = await registerSchedules(rt);
  rt.logger.info({ schedules: ids }, 'schedules registered');
  rt.shutdown.listen();
  const timer = setInterval(() => {}, 60_000);
  rt.shutdown.add('timer', () => clearInterval(timer));
  return rt;
}
