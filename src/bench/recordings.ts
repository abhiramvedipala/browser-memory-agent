import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecordingSchema, type Recording } from '../recorder/golden.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const RECORDINGS_DIR = join(here, '..', '..', 'bench', 'recordings');

export function loadRecordings(dir = RECORDINGS_DIR): Recording[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => RecordingSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
}
