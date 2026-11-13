import type { Logger } from './logger.js';

type Hook = { name: string; fn: () => Promise<void> | void };

/**
 * Graceful shutdown: on SIGTERM/SIGINT, run hooks in reverse registration order (stop
 * accepting work first, drain jobs, then close connections), with a hard timeout.
 */
export class Shutdown {
  private readonly hooks: Hook[] = [];
  private running?: Promise<void>;

  constructor(
    private readonly logger: Logger,
    private readonly timeoutMs = 30_000,
  ) {}

  add(name: string, fn: () => Promise<void> | void): void {
    this.hooks.push({ name, fn });
  }

  listen(): void {
    for (const sig of ['SIGTERM', 'SIGINT'] as const) {
      process.once(sig, () => {
        this.logger.info({ signal: sig }, 'shutting down');
        void this.run().then(() => process.exit(0));
      });
    }
  }

  run(): Promise<void> {
    this.running ??= (async () => {
      const timer = setTimeout(() => {
        this.logger.error('shutdown timed out, exiting');
        process.exit(1);
      }, this.timeoutMs);
      timer.unref();
      for (const hook of [...this.hooks].reverse()) {
        try {
          await hook.fn();
          this.logger.debug({ hook: hook.name }, 'shutdown hook done');
        } catch (err) {
          this.logger.error({ err, hook: hook.name }, 'shutdown hook failed');
        }
      }
      clearTimeout(timer);
    })();
    return this.running;
  }
}
