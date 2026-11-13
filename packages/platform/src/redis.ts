import { Redis } from 'ioredis';

export type { Redis };

/** Redis connection. BullMQ workers need `maxRetriesPerRequest: null`. */
export function createRedis(url: string, opts: { forBullmq?: boolean; name?: string } = {}): Redis {
  return new Redis(url, {
    ...(opts.forBullmq ? { maxRetriesPerRequest: null } : {}),
    ...(opts.name ? { connectionName: opts.name } : {}),
    lazyConnect: false,
  });
}

/** Realtime fan-out channel for one tenant (consumed by the realtime gateway). */
export const realtimeChannel = (tenantId: string) => `rt:${tenantId}`;
