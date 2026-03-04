CREATE TABLE IF NOT EXISTS message_links (
  primary_message_id INTEGER NOT NULL,
  linked_message_id INTEGER NOT NULL,
  confidence REAL NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (primary_message_id, linked_message_id),
  FOREIGN KEY (primary_message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CHECK (primary_message_id <> linked_message_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS message_links_pair_uniq
  ON message_links (
    CASE WHEN primary_message_id < linked_message_id THEN primary_message_id ELSE linked_message_id END,
    CASE WHEN primary_message_id < linked_message_id THEN linked_message_id ELSE primary_message_id END
  );
