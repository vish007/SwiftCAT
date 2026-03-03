import test from 'node:test';
import assert from 'node:assert/strict';
import { DB } from '../src/db.js';
import { buildSuggestions } from '../src/suggest.js';

test('link uniqueness prevents duplicates regardless of order', () => {
  const db = new DB();
  db.seed([
    { id: 1, parsed: {} },
    { id: 2, parsed: {} },
  ]);

  db.addLink({ primaryMessageId: 1, linkedMessageId: 2, confidence: 1, createdBy: 'manual', rationale: 'x' });
  assert.throws(
    () => db.addLink({ primaryMessageId: 2, linkedMessageId: 1, confidence: 1, createdBy: 'manual', rationale: 'y' }),
    /Duplicate link/,
  );
});

test('suggest logic scores reference/amount/date/bic', () => {
  const message = {
    id: 1,
    parsed: { externalRef: 'INV-1', amount: 100, bookingDate: '2026-03-01', senderBic: 'A', receiverBic: 'B' },
  };
  const candidates = [
    message,
    { id: 2, parsed: { externalRef: 'INV-1', amount: 100, bookingDate: '2026-03-02', senderBic: 'B', receiverBic: 'A' } },
    { id: 3, parsed: { externalRef: 'NOPE', amount: 999, bookingDate: '2026-03-20', senderBic: 'X', receiverBic: 'Y' } },
  ];

  const suggestions = buildSuggestions(message, candidates, []);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].linked_message_id, 2);
  assert.equal(suggestions[0].confidence, 1);
});
