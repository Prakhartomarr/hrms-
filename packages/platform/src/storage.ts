import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';

/**
 * File storage for employee documents. Local disk for development; an S3-compatible store can
 * implement the same three methods later. Keys are always `<tenantId>/...`.
 */
export interface FileStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export class LocalFileStore implements FileStore {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    const clean = normalize(key);
    if (clean.startsWith('..') || isAbsolute(clean)) throw new Error('Invalid storage key');
    return join(this.root, clean);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
