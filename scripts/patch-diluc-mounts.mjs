#!/usr/bin/env node
/**
 * Patches Diluc's containerConfig to mount prereq course materials.
 * Run once after the service has started and groups are registered.
 *
 * Usage: node scripts/patch-diluc-mounts.mjs
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'nanoclaw.db');

const db = new Database(DB_PATH);

const folder = 'telegram_diluc';
const row = db
  .prepare('SELECT container_config FROM registered_groups WHERE folder = ?')
  .get(folder);

if (!row) {
  console.error(`No registered group found for folder "${folder}". Is the service running?`);
  process.exit(1);
}

const cc = row.container_config ? JSON.parse(row.container_config) : {};

cc.additionalMounts = [
  {
    hostPath: '~/context/academic/finm330',
    containerPath: 'finm330',
    readonly: true,
  },
  {
    hostPath: '~/context/academic/finm345',
    containerPath: 'finm345',
    readonly: true,
  },
];

db.prepare(
  'UPDATE registered_groups SET container_config = ? WHERE folder = ?',
).run(JSON.stringify(cc), folder);

console.log(`Patched ${folder} with additionalMounts:`);
console.log(JSON.stringify(cc.additionalMounts, null, 2));
console.log('\nRestart the service for changes to take effect.');
