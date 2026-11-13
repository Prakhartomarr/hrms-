import type { Redis } from 'ioredis';

const HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { n, redis.call('PTTL', KEYS[1]) }`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/** Fixed-window rate limiter shared by every API instance (Redis). */
export class RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const window = Math.floor(Date.now() / windowMs);
    const [count, ttl] = (await this.redis.eval(
      HIT,
      1,
      `${this.prefix}:rl:${key}:${window}`,
      windowMs,
    )) as [number, number];
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetMs: Math.max(ttl, 0),
    };
  }
}
