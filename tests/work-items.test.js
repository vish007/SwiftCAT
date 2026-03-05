import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = 'data/test.db';

const { runSqlJson, runSql } = await import('../src/db.js');
const { app } = await import('../src/server.js');

const port = 4011;
let server;

test.before(() => {
  execFileSync('bash', ['scripts/migrate.sh'], { env: process.env, stdio: 'inherit' });
});

test.beforeEach(async () => {
  runSql('DELETE FROM work_item_events;');
  runSql('DELETE FROM audit_entries;');
  runSql('DELETE FROM work_items;');
  runSql('DELETE FROM swift_messages;');
  server = app.listen(port);
  await new Promise((r) => setTimeout(r, 20));
});

test.afterEach(() => {
  server.close();
});

test('ingest creates a work item in RECEIVED/unknown', async () => {
  const payload = {
    raw_message: '{1:F01AAAABBCCDD12}{2:I103ZZZZYYXXWW33}{4:\n:20:WI-REF-1\n:32A:240101USD500,00\n-}',
    message_type: 'MT103',
    sender_bic: 'AAAABBCCDDD',
    receiver_bic: 'ZZZZYYXXWWW',
    direction: 'IN',
    value_date: '2024-01-01',
    amount: 500,
    currency: 'USD',
    external_ref: 'WI-REF-1'
  };

  const res = await fetch(`http://localhost:${port}/ingest/swift`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(res.status, 200);

  const rows = runSqlJson(`
    SELECT wi.state, wi.domain
    FROM work_items wi
    JOIN swift_messages sm ON sm.id = wi.canonical_message_id
    WHERE sm.external_ref='WI-REF-1';
  `);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'RECEIVED');
  assert.equal(rows[0].domain, 'unknown');
});

test('manual transition writes work_item_events and audit_entries', async () => {
  await fetch(`http://localhost:${port}/ingest/swift`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      raw_message: '{1:F01AAAABBCCDD12}{2:I202ZZZZYYXXWW33}{4:\n:20:WI-REF-2\n:32A:240101USD999,99\n-}',
      message_type: 'MT202',
      sender_bic: 'AAAABBCCDDD',
      receiver_bic: 'ZZZZYYXXWWW',
      direction: 'OUT',
      value_date: '2024-01-01',
      amount: 999.99,
      currency: 'USD',
      external_ref: 'WI-REF-2'
    })
  });

  const workItemId = runSqlJson("SELECT id FROM work_items ORDER BY id DESC LIMIT 1;")[0].id;

  const transitionRes = await fetch(`http://localhost:${port}/work-items/${workItemId}/transition`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state: 'PROCESSING', actor: 'test-user', payload: { reason: 'triage' } })
  });

  assert.equal(transitionRes.status, 200);

  const events = runSqlJson(`SELECT event_type, payload FROM work_item_events WHERE work_item_id=${workItemId};`);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'STATE_TRANSITION');
  assert.equal(JSON.parse(events[0].payload).to_state, 'PROCESSING');

  const audits = runSqlJson(`SELECT action, details FROM audit_entries WHERE entity_type='work_item' AND entity_id='${workItemId}';`);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'MANUAL_TRANSITION');
});
