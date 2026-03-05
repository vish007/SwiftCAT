#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${DB_PATH:-data/swiftcat.db}"
mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$DB_PATH" <<'SQL'
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS swift_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_message TEXT NOT NULL,
  parsed_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ingested',
  risk_score REAL NOT NULL DEFAULT 0,
  queue_id TEXT,
  external_ref TEXT NOT NULL,
  mt_type TEXT NOT NULL,
  sender_bic TEXT NOT NULL,
  receiver_bic TEXT NOT NULL,
  direction TEXT NOT NULL,
  value_date TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(external_ref, mt_type)
);
CREATE INDEX IF NOT EXISTS idx_swift_ref ON swift_messages(external_ref);
CREATE INDEX IF NOT EXISTS idx_swift_mt_type ON swift_messages(mt_type);
CREATE INDEX IF NOT EXISTS idx_swift_value_date ON swift_messages(value_date);
CREATE INDEX IF NOT EXISTS idx_swift_created_at ON swift_messages(created_at);

CREATE TABLE IF NOT EXISTS work_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_message_id INTEGER NOT NULL UNIQUE,
  domain TEXT NOT NULL DEFAULT 'unknown' CHECK (domain IN ('payments','trade','reconciliation','compliance','unknown')),
  state TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (state IN ('RECEIVED','CLASSIFIED','SCREENED','ROUTED','PROCESSING','WAITING_APPROVAL','EXCEPTION','CLOSED')),
  queue_id INTEGER,
  owner_user_id INTEGER,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Urgent')),
  sla_due_at TEXT,
  ageing_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canonical_message_id) REFERENCES swift_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_work_items_state ON work_items(state);
CREATE INDEX IF NOT EXISTS idx_work_items_domain ON work_items(domain);
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
CREATE INDEX IF NOT EXISTS idx_work_items_queue ON work_items(queue_id);

CREATE TABLE IF NOT EXISTS work_item_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL
