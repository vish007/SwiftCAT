import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('manual and confirm/reject link actions are audited', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  let res = await fetch(`${base}/messages/1/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linked_message_id: 3, rationale: 'operator choice' }),
  });
  assert.equal(res.status, 201);

  res = await fetch(`${base}/messages/1/links/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linked_message_id: 2, rationale: 'false positive' }),
  });
  assert.equal(res.status, 201);

  const message = await fetch(`${base}/messages/1`).then((r) => r.json());
  const actionTypes = message.actions.map((a) => a.action_type);
  assert.ok(actionTypes.includes('ManualLink'));
  assert.ok(actionTypes.includes('RejectLink'));

  server.close();
});
