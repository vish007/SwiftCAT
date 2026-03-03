import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = 'data/test.db';

const { runSqlJson, runSql } = await import('../src/db.js');
const { app } = await import('../src/server.js');

const port = 3999;
let server;

test.before(() => {
  execFileSync('bash', ['scripts/migrate.sh'], { env: process.env, stdio: 'inherit' });
});

test.beforeEach(async () => {
  runSql('DELETE FROM swift_messages;');
  server = app.listen(port);
  await new Promise((r) => setTimeout(r, 20));
});

test.afterEach(() => {
  server.close();
});

test('ingest endpoint is idempotent by external_ref + mt', async () => {
  const payload = {
    raw_message: '{1:F01AAAABBCCDD12}{2:I103ZZZZYYXXWW33}{4:\n:20:IDEMP-1\n:32A:240101USD500,00\n-}',
    message_type: 'MT103',
    sender_bic: 'AAAABBCCDDD',
    receiver_bic: 'ZZZZYYXXWWW',
    direction: 'IN',
    value_date: '2024-01-01',
    amount: 500,
    currency: 'USD',
    external_ref: 'IDEMP-1'
  };

  await fetch(`http://localhost:${port}/ingest/swift`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  await fetch(`http://localhost:${port}/ingest/swift`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

  const count = runSqlJson("SELECT COUNT(*) as count FROM swift_messages WHERE external_ref='IDEMP-1' AND mt_type='MT103';")[0].count;
  assert.equal(count, 1);
});
