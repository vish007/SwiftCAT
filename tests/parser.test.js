import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSwiftMessage } from '../src/parser.js';

test('parseSwiftMessage extracts minimum fields', () => {
  const raw = '{1:F01AAAABBCCDD12}{2:I103ZZZZYYXXWW33}{4:\n:20:REF123\n:32A:240101USD100,25\n:50K:ORDER\n:59:BEN\n-}';
  const parsed = parseSwiftMessage(raw, 'MT103');
  assert.equal(parsed.ref, 'REF123');
  assert.equal(parsed.mt, 'MT103');
  assert.equal(parsed.amount.currency, 'USD');
  assert.equal(parsed.amount.value, 100.25);
  assert.equal(parsed.dates.value_date, '2024-01-01');
});
