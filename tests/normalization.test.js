import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMT, normalizeMX } from '../src/normalization.js';

test('normalizeMT returns canonical payload and entities', () => {
  const raw = '{1:F01AAAABBCCDD12}{2:I103ZZZZYYXXWW33}{4:\n:20:REF123\n:32A:240101USD100,25\n:50K:ORDER\n:59:BEN\n-}';
  const canonical = normalizeMT(raw, 'MT103');

  assert.equal(canonical.format, 'MT');
  assert.equal(canonical.message_type, 'MT103');
  assert.equal(canonical.family, 'payments');
  assert.equal(canonical.entities.refs.transaction_reference, 'REF123');
  assert.equal(canonical.entities.amounts.currency, 'USD');
  assert.equal(canonical.validation_status, 'valid');
});

test('normalizeMX validates basic XML and detects message type', () => {
  const xml = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"><FIToFICstmrCdtTrf><GrpHdr><MsgId>MSG-1</MsgId></GrpHdr><CdtTrfTxInf><PmtId><EndToEndId>E2E-1</EndToEndId></PmtId><IntrBkSttlmAmt Ccy="USD">900.10</IntrBkSttlmAmt><IntrBkSttlmDt>2024-01-01</IntrBkSttlmDt></CdtTrfTxInf></FIToFICstmrCdtTrf></Document>`;
  const canonical = normalizeMX(xml, 'pacs.008.001.08');

  assert.equal(canonical.format, 'MX');
  assert.equal(canonical.message_type, 'pacs.008.001.08');
  assert.equal(canonical.family, 'payments');
  assert.equal(canonical.entities.refs.end_to_end_id, 'E2E-1');
  assert.equal(canonical.entities.schema.xsd_validation.status, 'not_performed');
  assert.equal(canonical.validation_status, 'valid');
});

