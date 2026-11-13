import { pino, type Logger } from 'pino';
import { currentContext } from './context.js';

export type { Logger };

export interface LoggerOptions {
  name: string;
  level?: string;
  pretty?: boolean;
}

/** Structured JSON logs; every line carries the request, tenant, user and job ids in scope. */
export function createLogger(opts: LoggerOptions): Logger {
  return pino({
    name: opts.name,
    level: opts.level ?? 'info',
    redact: {
      paths: [
        'password',
        '*.password',
        'secrets',
        '*.secrets',
        'authorization',
        '*.authorization',
        'refreshToken',
      ],
      censor: '[redacted]',
    },
    mixin() {
      const ctx = currentContext();
      if (!ctx) return {};
      return {
        requestId: ctx.requestId,
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        ...(ctx.userId ? { userId: ctx.userId } : {}),
        ...(ctx.jobId ? { jobId: ctx.jobId, job: ctx.jobName } : {}),
      };
    },
    ...(opts.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, ignore: 'pid,hostname,role' },
          },
        }
      : {}),
  });
}
