import { runSql } from '../src/db.js';
import { insertSwiftMessage, upsertCanonicalMessage } from '../src/repository.js';
import { normalizeMessage } from '../src/normalization.js';

runSql('DELETE FROM canonical_messages;');
runSql('DELETE FROM swift_messages;');

const mtTypes = ['MT103', 'MT202', 'MT910', 'MT940', 'MT700', 'MT707', 'MT760'];
for (let i = 1; i <= 20; i += 1) {
  const mt = mtTypes[i % mtTypes.length];
  const ref = `EXT-MT-${String(i).padStart(4, '0')}`;
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
  const canonical = normalizeMessage(raw, mt);
  const swift = insertSwiftMessage(msg, canonical.normalized_payload);
  upsertCanonicalMessage(swift.id, canonical);
}

for (let i = 1; i <= 10; i += 1) {
  const isPacs = i <= 5;
  const messageType = isPacs ? 'pacs.008.001.08' : 'camt.053.001.08';
  const ref = `EXT-MX-${String(i).padStart(4, '0')}`;
  const raw = isPacs
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"><FIToFICstmrCdtTrf><GrpHdr><MsgId>MSG${i}</MsgId></GrpHdr><CdtTrfTxInf><PmtId><InstrId>INSTR${i}</InstrId><EndToEndId>E2E${i}</EndToEndId></PmtId><IntrBkSttlmAmt Ccy="USD">${2000 + i}.50</IntrBkSttlmAmt><IntrBkSttlmDt>2024-03-${String(i).padStart(2, '0')}</IntrBkSttlmDt></CdtTrfTxInf></FIToFICstmrCdtTrf></Document>`
    : `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><GrpHdr><MsgId>STM${i}</MsgId></GrpHdr><Stmt><Acct><Nm>NOSTRO ${i}</Nm></Acct><Bal><Amt Ccy="EUR">${5000 + i}.00</Amt></Bal><CreDtTm>2024-04-${String(i).padStart(2, '0')}T09:30:00Z</CreDtTm></Stmt></BkToCstmrStmt></Document>`;
  const msg = {
    raw_message: raw,
    message_type: messageType,
    sender_bic: 'MXSENDERBIC1',
    receiver_bic: 'MXRECEIVERB1',
    direction: i % 2 ? 'IN' : 'OUT',
    value_date: `2024-04-${String(i).padStart(2, '0')}`,
    amount: 2000 + i,
    currency: isPacs ? 'USD' : 'EUR',
    external_ref: ref,
    status: 'ingested'
  };
  const canonical = normalizeMessage(raw, messageType);
  const swift = insertSwiftMessage(msg, canonical.normalized_payload);
  upsertCanonicalMessage(swift.id, canonical);
}

console.log('Seeded 30 synthetic SWIFT messages (20 MT + 10 MX) with canonical records');
