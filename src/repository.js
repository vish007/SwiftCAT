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
  const record = normalizeRow(row);
  ensureWorkItemForMessage(record.id);
  return getSwiftMessageById(record.id);
}

export function listSwiftMessages(filters) {
  const where = [];
  if (filters.ref) where.push(`external_ref LIKE ${escapeSql(`%${filters.ref}%`)}`);
  if (filters.mt_type) where.push(`mt_type = ${escapeSql(filters.mt_type)}`);
  if (filters.status) where.push(`status = ${escapeSql(filters.status)}`);
  if (filters.from_date) where.push(`date(value_date) >= date(${escapeSql(filters.from_date)})`);
  if (filters.to_date) where.push(`date(value_date) <= date(${escapeSql(filters.to_date)})`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT sm.*, wi.id AS work_item_id, wi.state AS work_item_state
    FROM swift_messages sm
    LEFT JOIN work_items wi ON wi.canonical_message_id = sm.id
    ${whereSql.replace(/external_ref|mt_type|status|value_date|created_at/g, (token) => `sm.${token}`)}
    ORDER BY datetime(sm.created_at) DESC;
  `;
  return runSqlJson(sql).map(normalizeRow);
}

export function getSwiftMessageById(id) {
  const row = runSqlJson(`
    SELECT sm.*, wi.id AS work_item_id, wi.state AS work_item_state
    FROM swift_messages sm
    LEFT JOIN work_items wi ON wi.canonical_message_id = sm.id
    WHERE sm.id=${Number(id)}
    LIMIT 1;
  `)[0];
  return row ? normalizeRow(row) : null;
}

export function ensureWorkItemForMessage(canonicalMessageId) {
  runSql(`
    INSERT INTO work_items (canonical_message_id, domain, state, priority, ageing_minutes)
    VALUES (${Number(canonicalMessageId)}, 'unknown', 'RECEIVED', 'Medium', 0)
    ON CONFLICT(canonical_message_id) DO NOTHING;
  `);
  return runSqlJson(`SELECT * FROM work_items WHERE canonical_message_id=${Number(canonicalMessageId)} LIMIT 1;`)[0] || null;
}

export function listWorkItems(filters = {}) {
  const where = [];
  if (filters.state) where.push(`wi.state = ${escapeSql(filters.state)}`);
  if (filters.domain) where.push(`wi.domain = ${escapeSql(filters.domain)}`);
  if (filters.queue) where.push(`wi.queue_id = ${Number(filters.queue)}`);
  if (filters.priority) where.push(`wi.priority = ${escapeSql(filters.priority)}`);
  if (filters.ageing) where.push(`wi.ageing_minutes >= ${Number(filters.ageing)}`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT wi.*, sm.external_ref, sm.mt_type, sm.amount, sm.currency, sm.value_date
    FROM work_items wi
    JOIN swift_messages sm ON sm.id = wi.canonical_message_id
    ${whereSql}
    ORDER BY datetime(wi.updated_at) DESC;
  `;
  return runSqlJson(sql).map(normalizeWorkItem);
}

export function getWorkItemById(id) {
  const row = runSqlJson(`
    SELECT wi.*, sm.external_ref, sm.mt_type, sm.amount, sm.currency, sm.value_date, sm.direction
    FROM work_items wi
    JOIN swift_messages sm ON sm.id = wi.canonical_message_id
    WHERE wi.id = ${Number(id)}
    LIMIT 1;
  `)[0];
  if (!row) return null;
  const events = runSqlJson(`SELECT * FROM work_item_events WHERE work_item_id=${Number(id)} ORDER BY datetime(created_at) DESC;`);
  return { ...normalizeWorkItem(row), events: events.map(normalizeEvent) };
}

export function assignWorkItem(id, { ownerUserId = null, queueId = null }) {
  const existing = getWorkItemById(id);
  if (!existing) return null;

  runSql(`
    UPDATE work_items
    SET owner_user_id=${ownerUserId === null ? 'NULL' : Number(ownerUserId)},
        queue_id=${queueId === null ? 'NULL' : Number(queueId)},
        updated_at=CURRENT_TIMESTAMP
    WHERE id=${Number(id)};
  `);
  createWorkItemEvent(Number(id), 'ASSIGNED', { owner_user_id: ownerUserId, queue_id: queueId });
  return getWorkItemById(id);
}

export function transitionWorkItem(id, { state, actor = 'system', payload = {} }) {
  const workItemId = Number(id);
  const existing = getWorkItemById(workItemId);
  if (!existing) return null;

  runSql(`
    UPDATE work_items
    SET state=${escapeSql(state)},
        ageing_minutes=CAST((julianday('now') - julianday(created_at)) * 24 * 60 AS INTEGER),
        updated_at=CURRENT_TIMESTAMP
    WHERE id=${workItemId};
  `);

  createWorkItemEvent(workItemId, 'STATE_TRANSITION', { from_state: existing.state, to_state: state, actor, ...payload });
  runSql(`
    INSERT INTO audit_entries (entity_type, entity_id, action, details)
    VALUES ('work_item', ${escapeSql(String(workItemId))}, 'MANUAL_TRANSITION', ${escapeSql(JSON.stringify({ state, actor, ...payload }))});
  `);

  return getWorkItemById(workItemId);
}

function createWorkItemEvent(workItemId, eventType, payload) {
  runSql(`
    INSERT INTO work_item_events (work_item_id, event_type, payload)
    VALUES (${Number(workItemId)}, ${escapeSql(eventType)}, ${escapeSql(JSON.stringify(payload || {}))});
  `);
}

function normalizeWorkItem(row) {
  return {
    ...row,
    queue_id: row.queue_id === null ? null : Number(row.queue_id),
    owner_user_id: row.owner_user_id === null ? null : Number(row.owner_user_id)
  };
}

function normalizeEvent(row) {
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  };
}

function normalizeRow(row) {
  return {
    ...row,
    parsed_payload: typeof row.parsed_payload === 'string' ? JSON.parse(row.parsed_payload) : row.parsed_payload
  };
}
