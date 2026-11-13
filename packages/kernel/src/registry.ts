import type { PageDef, ResourceDef } from '@hrms/contracts';
import type { AccessCatalogRegistry, ModuleDefinition } from '@hrms/module-sdk';
import { createLogger, type Logger } from '@hrms/platform';
import { discoverPlugins, importPlugin, type PluginPackage } from './discovery.js';

export interface LoadedModule {
  definition: ModuleDefinition;
  pkg: PluginPackage;
}

export interface PluginLoadOptions {
  /** `true` throws on the first broken module (production); `false` logs and skips it. */
  failFast?: boolean;
  logger?: Pick<Logger, 'error'>;
  root?: string;
}

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return [env.APP_ENV, env.NODE_ENV].some((v) => v?.trim() === 'production');
}

/**
 * Loads modules and orders them so every module comes after its dependencies. Outside
 * fail-fast mode a broken module (or one depending on it) is skipped with a logged error.
 */
export async function loadModules(disabled: string[] = [], opts: PluginLoadOptions = {}): Promise<LoadedModule[]> {
  const failFast = opts.failFast ?? isProductionEnv();
  const log = opts.logger ?? createLogger({ name: 'modules' });
  const fail = (name: string, err: unknown) => {
    if (failFast) throw err;
    log.error({ module: name, err }, `Skipped module ${name}: ${(err as Error).message}`);
  };
  const loaded: LoadedModule[] = [];
  for (const pkg of discoverPlugins('module', opts.root, failFast ? undefined : (f, e) => fail(f, e))) {
    try {
      const definition = await importPlugin<ModuleDefinition>(pkg);
      if (!definition?.id) throw new Error(`${pkg.name} does not export a module (use defineModule)`);
      if (disabled.includes(definition.id)) continue;
      if (loaded.some((m) => m.definition.id === definition.id)) throw new Error(`Duplicate module id ${definition.id}`);
      loaded.push({ definition, pkg });
    } catch (err) {
      fail(pkg.name, err);
    }
  }
  const byId = new Map(loaded.map((m) => [m.definition.id, m]));
  const ordered: LoadedModule[] = [];
  const state = new Map<string, 'visiting' | 'done' | 'skipped'>();
  const visit = (m: LoadedModule, trail: string[]): boolean => {
    const id = m.definition.id;
    const seen = state.get(id);
    if (seen === 'done') return true;
    if (seen === 'skipped') return false;
    if (seen === 'visiting') throw new Error(`Module dependency cycle: ${[...trail, id].join(' -> ')}`);
    state.set(id, 'visiting');
    for (const dep of m.definition.dependsOn ?? []) {
      const d = byId.get(dep);
      if (d && visit(d, [...trail, id])) continue;
      state.set(id, 'skipped');
      fail(m.pkg.name, new Error(`Module ${id} depends on missing or disabled module ${dep}`));
      return false;
    }
    state.set(id, 'done');
    ordered.push(m);
    return true;
  };
  for (const m of loaded) visit(m, []);
  return ordered;
}

export function accessCatalog(modules: ModuleDefinition[]): AccessCatalogRegistry {
  const resources: ResourceDef[] = modules.flatMap((m) => m.resources ?? []);
  const pages: PageDef[] = modules.flatMap((m) => m.pages ?? []);
  const seen = new Set<string>();
  for (const x of [...resources.map((r) => `r:${r.id}`), ...pages.map((p) => `p:${p.id}`)]) {
    if (seen.has(x)) throw new Error(`Declared twice: ${x}`);
    seen.add(x);
  }
  return { resources: () => resources, pages: () => pages };
}
