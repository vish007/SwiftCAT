#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${DB_PATH:-data/swiftcat.db}"
mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$DB_PATH" <<'SQL'
PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS canonical_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  swift_message_id INTEGER NOT NULL UNIQUE,
  format TEXT NOT NULL CHECK (format IN ('MT', 'MX')),
  message_type TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN ('payments', 'trade', 'statements', 'admin', 'unknown')),
  entities TEXT NOT NULL,
  normalized_payload TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('valid', 'invalid', 'warning')),
  validation_errors TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(swift_message_id) REFERENCES swift_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_swift_ref ON swift_messages(external_ref);
CREATE INDEX IF NOT EXISTS idx_swift_mt_type ON swift_messages(mt_type);
CREATE INDEX IF NOT EXISTS idx_swift_value_date ON swift_messages(value_date);
CREATE INDEX IF NOT EXISTS idx_swift_created_at ON swift_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_canonical_message_type ON canonical_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_canonical_family ON canonical_messages(family);
CREATE INDEX IF NOT EXISTS idx_canonical_refs_message_id ON canonical_messages(json_extract(entities, '$.refs.message_id'));
CREATE INDEX IF NOT EXISTS idx_canonical_refs_transaction_reference ON canonical_messages(json_extract(entities, '$.refs.transaction_reference'));
SQL
