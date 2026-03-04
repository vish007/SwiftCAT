import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function getDbPath() {
  return process.env.DB_PATH || 'data/swiftcat.db';
}

function ensureDir() {
  mkdirSync(dirname(getDbPath()), { recursive: true });
}

export function runSql(sql) {
  ensureDir();
  return execFileSync('sqlite3', [getDbPath(), sql], { encoding: 'utf8' });
}

export function runSqlJson(sql) {
  ensureDir();
  const output = execFileSync('sqlite3', ['-json', getDbPath(), sql], { encoding: 'utf8' }).trim();
  if (!output) return [];
  return JSON.parse(output);
}

export function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
