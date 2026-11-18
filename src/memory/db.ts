import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Ordered migrations. The database's PRAGMA user_version is the number of
 * migrations already applied; add new entries at the end, never edit old ones.
 */
export const MIGRATIONS: { version: number; name: string; sql: () => string }[] = [
  { version: 1, name: 'initial schema', sql: () => readFileSync(join(here, 'schema.sql'), 'utf8') },
];

export function migrate(db: Db): number {
  let current = db.pragma('user_version', { simple: true }) as number;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql());
      db.pragma(`user_version = ${m.version}`);
    })();
    current = m.version;
  }
  return current;
}

/** Open (and migrate) a database. Use ':memory:' in tests. */
export function openDb(path = ':memory:'): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
