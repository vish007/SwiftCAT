import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, matchSet, suggestQueue } from '../src/core.mjs';

test('parser validates message', () => {
  const m = parseMessage({ type: 'MT103', amount: 1, account: 'ABCD', reference: 'REF' });
  assert.equal(m.type, 'MT103');
});

test('matcher recognizes settlement pairing', () => {
  const result = matchSet([{ type: 'MT202' }, { type: 'MT950' }]);
  assert.equal(result.matched, true);
});

test('ai suggestion routes category-7 LC to risk', () => {
  const queue = suggestQueue({ type: 'LC', category: '7', amount: 10 });
  assert.equal(queue, 'risk');
});
