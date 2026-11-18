import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..');
export const DEFAULT_DB_PATH = process.env.BMA_DB ?? join(ROOT, 'data', 'bma.db');
export const RUNS_DIR = process.env.BMA_RUNS_DIR ?? join(ROOT, 'runs');

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}
export function ensureParentDir(file: string): string {
  mkdirSync(dirname(file), { recursive: true });
  return file;
}
