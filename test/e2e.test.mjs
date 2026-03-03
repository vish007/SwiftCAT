import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, jfetch } from './helpers.mjs';

test('a) Category-7 LC -> risk', async () => {
  await withServer(async (base) => {
    const res = await jfetch(base, '/messages', {
      method: 'POST', headers: { 'x-role': 'ops' },
      body: JSON.stringify({ type: 'LC', category: '7', amount: 1000, account: 'LCAA', reference: 'LCX' })
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.queue, 'risk');
  });
});

test('b) MT103+202+910 matched to MT940/950', async () => {
  await withServer(async (base) => {
    for (const t of ['MT103', 'MT202', 'MT910', 'MT940', 'MT950']) {
      await jfetch(base, '/messages', {
        method: 'POST', headers: { 'x-role': 'ops' },
        body: JSON.stringify({ type: t, amount: 100, account: 'M123', reference: 'MATCHREF' })
      });
    }
    const matched = await jfetch(base, '/match/MATCHREF', { method: 'POST', headers: { 'x-role': 'ops' } });
    assert.equal(matched.body.matched, true);
  });
});

test('c) One MT202 unmatched -> exception -> close', async () => {
  await withServer(async (base) => {
    const create = await jfetch(base, '/messages', {
      method: 'POST', headers: { 'x-role': 'ops' },
      body: JSON.stringify({ type: 'MT202', amount: 100, account: 'U123', reference: 'UNREF' })
    });
    const unmatched = await jfetch(base, '/match/UNREF', { method: 'POST', headers: { 'x-role': 'ops' } });
    assert.ok(unmatched.body.exceptionId);
    const close = await jfetch(base, `/exceptions/${unmatched.body.exceptionId}/close`, {
      method: 'POST', headers: { 'x-role': 'compliance', 'x-user': 'banker.jane' }
    });
    assert.equal(close.body.status, 'closed');
    assert.equal(close.body.messageId, create.body.id);
  });
});
