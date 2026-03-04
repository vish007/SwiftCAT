import { escapeSql, runSql, runSqlJson } from './db.js';

export function insertSwiftMessage(input, parsedPayload) {
  const sql = `
  INSERT INTO swift_messages (
    raw_message, parsed_payload, status, risk_score, queue_id,
    external_ref, mt_type, sender_bic, receiver_bic, direction,
    value_date, amount, currency
  ) VALUES (
    ${escapeSql(input.raw_message)},
    ${escapeSql(JSON.stringify(parsedPayload))},
    ${escapeSql(input.status || 'ingested')},
    ${Number(input.risk_score || 0)},
    ${escapeSql(input.queue_id || null)},
    ${escapeSql(input.external_ref)},
    ${escapeSql(input.message_type)},
    ${escapeSql(input.sender_bic)},
    ${escapeSql(input.receiver_bic)},
    ${escapeSql(input.direction)},
    ${escapeSql(input.value_date)},
    ${Number(input.amount || 0)},
    ${escapeSql(input.currency)}
  )
  ON CONFLICT(external_ref, mt_type) DO UPDATE SET
    raw_message=excluded.raw_message,
    parsed_payload=excluded.parsed_payload,
    sender_bic=excluded.sender_bic,
    receiver_bic=excluded.receiver_bic,
    direction=excluded.direction,
    value_date=excluded.value_date,
    amount=excluded.amount,
    currency=excluded.currency,
    updated_at=CURRENT_TIMESTAMP;
  `;
  runSql(sql);

  const row = runSqlJson(`SELECT * FROM swift_messages WHERE external_ref=${escapeSql(input.external_ref)} AND mt_type=${escapeSql(input.message_type)} LIMIT 1;`)[0];
  return normalizeRow(row);
}

export function listSwiftMessages(filters) {
  const where = [];
  if (filters.ref) where.push(`external_ref LIKE ${escapeSql(`%${filters.ref}%`)}`);
  if (filters.mt_type) where.push(`mt_type = ${escapeSql(filters.mt_type)}`);
  if (filters.status) where.push(`status = ${escapeSql(filters.status)}`);
  if (filters.from_date) where.push(`date(value_date) >= date(${escapeSql(filters.from_date)})`);
  if (filters.to_date) where.push(`date(value_date) <= date(${escapeSql(filters.to_date)})`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return runSqlJson(`SELECT * FROM swift_messages ${whereSql} ORDER BY datetime(created_at) DESC;`).map(normalizeRow);
}

export function getSwiftMessageById(id) {
  const row = runSqlJson(`SELECT * FROM swift_messages WHERE id=${Number(id)} LIMIT 1;`)[0];
  return row ? normalizeRow(row) : null;
}

function normalizeRow(row) {
  return {
    ...row,
    parsed_payload: typeof row.parsed_payload === 'string' ? JSON.parse(row.parsed_payload) : row.parsed_payload
  };
}
