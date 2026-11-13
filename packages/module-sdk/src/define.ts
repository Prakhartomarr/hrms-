import type { z } from 'zod';
import type { JobDef, ModuleDefinition } from './types.js';

const ID = /^[a-z][a-z0-9-]*$/;

/**
 * Defines a feature module. A module package's default export must be the result, and its
 * package.json must contain `"hrms": { "kind": "module" }`. The api, worker and scheduler
 * discover and load it at boot; no core code changes are needed.
 */
export function defineModule(def: ModuleDefinition): ModuleDefinition {
  if (!ID.test(def.id)) throw new Error(`Module id must be kebab-case: ${def.id}`);
  for (const r of def.resources ?? []) {
    if (!r.id.startsWith(`${def.id}.`)) throw new Error(`Resource ${r.id} must start with "${def.id}."`);
    if (r.actions.length === 0) throw new Error(`Resource ${r.id} needs at least one action`);
  }
  const pages = new Set((def.pages ?? []).map((p) => p.id));
  for (const n of def.nav ?? []) {
    if (!pages.has(n.page)) throw new Error(`Nav ${n.id} uses page ${n.page}, which ${def.id} does not declare`);
  }
  for (const name of Object.keys(def.jobs ?? {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) throw new Error(`Invalid job name ${def.id}.${name}`);
  }
  const ids = new Set<string>();
  for (const s of def.schedules ?? []) {
    if (ids.has(s.id)) throw new Error(`Duplicate schedule ${s.id} in ${def.id}`);
    ids.add(s.id);
    if (!s.everyMs && !s.cron) throw new Error(`Schedule ${def.id}/${s.id} needs everyMs or cron`);
  }
  return Object.freeze(def);
}

/** Typed helper so the handler payload is inferred from the schema. */
export function defineJob<S extends z.ZodType>(def: JobDef<S>): JobDef {
  return def as unknown as JobDef;
}
