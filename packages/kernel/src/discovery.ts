import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PRODUCT } from '@hrms/contracts';
import { findRepoRoot } from '@hrms/platform';

export type PluginKind = 'module';

export interface PluginPackage {
  kind: PluginKind;
  name: string;
  version: string;
  dir: string;
  entry: string;
}

/** Folders scanned for plug-in packages, relative to the repo root. */
export const PLUGIN_DIRS: Record<PluginKind, string> = {
  module: 'modules',
};

interface PackageJson {
  name: string;
  version?: string;
  exports?: string | Record<string, unknown>;
  main?: string;
  [key: string]: unknown;
}

/**
 * True when running from TypeScript sources (tsx/vitest with the `development` condition).
 * Then plug-ins load from `src/`; otherwise from their built `dist/`.
 */
export function useSourceEntries(): boolean {
  if (process.env.HRMS_SOURCE === '1') return true;
  const flags = [...process.execArgv, process.env.NODE_OPTIONS ?? ''].join(' ');
  return /--conditions[= ]development|-C[= ]?development/.test(flags);
}

function entryOf(pkg: PackageJson): string {
  const root =
    typeof pkg.exports === 'object' && pkg.exports !== null
      ? (pkg.exports['.'] ?? pkg.exports)
      : pkg.exports;
  if (typeof root === 'string') return root;
  if (root && typeof root === 'object') {
    const r = root as Record<string, string | undefined>;
    const picked = (useSourceEntries() && r.development) || r.import || r.default;
    if (picked) return picked;
  }
  return pkg.main ?? 'dist/index.js';
}

export function repoRoot(): string {
  const root = findRepoRoot() ?? findRepoRoot(dirname(fileURLToPath(import.meta.url)));
  if (!root) throw new Error('Cannot find the repository root (pnpm-workspace.yaml)');
  return root;
}

/**
 * Finds plug-in packages: every `modules/*` folder whose package.json has
 * `"hrms": { "kind": "module" }`. Adding a module = adding a folder.
 */
export function discoverPlugins(
  kind: PluginKind,
  root = repoRoot(),
  onError?: (folder: string, error: Error) => void,
): PluginPackage[] {
  const base = join(root, PLUGIN_DIRS[kind]);
  if (!existsSync(base)) return [];
  const found: PluginPackage[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    let pkg: PackageJson;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
    } catch (err) {
      const error = new Error(`${pkgPath}: unreadable package.json (${(err as Error).message})`, {
        cause: err,
      });
      if (!onError) throw error;
      onError(join(PLUGIN_DIRS[kind], entry.name), error);
      continue;
    }
    const manifest = pkg[PRODUCT.manifestKey] as { kind?: string } | undefined;
    if (manifest?.kind !== kind) continue;
    found.push({
      kind,
      name: pkg.name,
      version: pkg.version ?? '0.0.0',
      dir,
      entry: join(dir, entryOf(pkg)),
    });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Imports a plug-in's default export. */
export async function importPlugin<T>(plugin: PluginPackage): Promise<T> {
  if (!existsSync(plugin.entry)) {
    throw new Error(
      `${plugin.name}: entry ${plugin.entry} not found. Run \`pnpm build\` or start with --conditions=development.`,
    );
  }
  const mod = (await import(pathToFileURL(plugin.entry).href)) as { default?: T };
  if (!mod.default) throw new Error(`${plugin.name}: missing default export`);
  return mod.default;
}
