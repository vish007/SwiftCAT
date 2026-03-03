import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, jfetch } from './helpers.mjs';

test('RBAC + pagination + metrics', async () => {
  await withServer(async (base) => {
    const forbidden = await jfetch(base, '/exceptions/1/close', { method: 'POST', headers: { 'x-role': 'ops' } });
    assert.equal(forbidden.status, 403);

    await jfetch(base, '/messages', {
      method: 'POST',
      headers: { 'x-role': 'ops' },
      body: JSON.stringify({ type: 'MT103', amount: 100, account: 'AC11', reference: 'INT1' })
    });

    const list = await jfetch(base, '/messages?page=1&pageSize=1', { headers: { 'x-role': 'auditor' } });
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 1);

    const metrics = await jfetch(base, '/metrics');
    assert.equal(metrics.status, 200);
    assert.match(metrics.text, /swiftcat_http_requests_total/);
  });
});
