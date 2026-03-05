import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = 'data/test.db';

const { runSql } = await import('../src/db.js');
const { app } = await import('../src/server.js');

const port = 4999;
let server;

test.before(() => {
  execFileSync('bash', ['scripts/migrate.sh'], { env: process.env, stdio: 'inherit' });
});

test.beforeEach(async () => {
  runSql('DELETE FROM canonical_messages;');
  runSql('DELETE FROM swift_messages;');
  server = app.listen(port);
  await new Promise((r) => setTimeout(r, 20));
});

test.afterEach(() => {
  server.close();
});

test('ingests MX pacs.008 and exposes canonical endpoints', async () => {
  const payload = {
    raw_message: '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"><FIToFICstmrCdtTrf><GrpHdr><MsgId>MSG-900</MsgId></GrpHdr><CdtTrfTxInf><PmtId><EndToEndId>E2E-900</EndToEndId></PmtId><IntrBkSttlmAmt Ccy="USD">900.00</IntrBkSttlmAmt><IntrBkSttlmDt>2024-01-01</IntrBkSttlmDt></CdtTrfTxInf></FIToFICstmrCdtTrf></Document>',
    message_type: 'pacs.008.001.08',
    sender_bic: 'AAAABBCCDDD',
    receiver_bic: 'ZZZZYYXXWWW',
    direction: 'IN',
    value_date: '2024-01-01',
    amount: 900,
    currency: 'USD',
    external_ref: 'MX-1'
  };

  const ingest = await fetch(`http://localhost:${port}/ingest/swift`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }).then((res) => res.json());

  assert.equal(ingest.data.canonical_message.format, 'MX');

  const bySwift = await fetch(`http://localhost:${port}/messages/${ingest.data.id}/canonical`).then((res) => res.json());
  assert.equal(bySwift.data.message_type, 'pacs.008.001.08');

  const byId = await fetch(`http://localhost:${port}/canonical/${bySwift.data.id}`).then((res) => res.json());
  assert.equal(byId.data.entities.refs.end_to_end_id, 'E2E-900');
});
