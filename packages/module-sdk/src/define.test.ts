import { describe, expect, it } from 'vitest';
import { defineModule } from './define.js';

describe('defineModule', () => {
  it('accepts a well-formed module', () => {
    const m = defineModule({
      id: 'demo',
      name: 'Demo',
      resources: [{ id: 'demo.things', label: 'Things', group: 'Demo', actions: ['view'], scoped: false }],
      pages: [{ id: 'demo', label: 'Demo' }],
      nav: [{ id: 'demo', label: 'Demo', path: '/demo', page: 'demo' }],
    });
    expect(Object.isFrozen(m)).toBe(true);
  });
  it.each([
    [{ id: 'Bad' }, 'kebab-case'],
    [{ id: 'demo', resources: [{ id: 'other.x', label: 'x', group: 'x', actions: ['view'], scoped: false }] }, 'must start with'],
    [{ id: 'demo', nav: [{ id: 'n', label: 'n', path: '/n', page: 'missing' }] }, 'does not declare'],
    [{ id: 'demo', schedules: [{ id: 's', job: 'j' }] }, 'needs everyMs or cron'],
  ])('rejects %j', (def, msg) => {
    expect(() => defineModule({ name: 'x', ...(def as { id: string }) } as never)).toThrow(msg);
  });
});
