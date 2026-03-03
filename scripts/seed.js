import { runSql } from '../src/db.js';
import { parseSwiftMessage } from '../src/parser.js';
import { insertSwiftMessage } from '../src/repository.js';

runSql('DELETE FROM swift_messages;');

const types = ['MT103', 'MT202', 'MT910', 'MT940', 'MT950', 'MT700', 'MT707', 'MT760'];
for (let i = 1; i <= 32; i += 1) {
  const mt = types[i % types.length];
  const ref = `EXT-REF-${String(i).padStart(4, '0')}`;
  const yy = 24;
  const mm = String((i % 12) + 1).padStart(2, '0');
  const dd = String((i % 27) + 1).padStart(2, '0');
  const raw = `{1:F01AAAABBCCDD12}{2:I${mt.slice(2)}ZZZZYYXXWW33}{4:\n:20:${ref}\n:32A:${yy}${mm}${dd}USD${1000 + i},50\n:50K:/123456\nORDERING PARTY ${i}\n:59:/987654\nBENEFICIARY ${i}\n-}`;
  const msg = {
    raw_message: raw,
    message_type: mt,
    sender_bic: 'AAAABBCCDDD',
    receiver_bic: 'ZZZZYYXXWWW',
    direction: i % 2 ? 'IN' : 'OUT',
    value_date: `20${yy}-${mm}-${dd}`,
    amount: 1000 + i,
    currency: 'USD',
    external_ref: ref,
    status: i % 3 ? 'ingested' : 'review'
  };
  insertSwiftMessage(msg, parseSwiftMessage(raw, mt));
}

console.log('Seeded 32 synthetic SWIFT messages');
