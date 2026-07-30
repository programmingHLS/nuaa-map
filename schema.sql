CREATE TABLE IF NOT EXISTS qa_entries (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_logs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT,
  building_id TEXT,
  building_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qa_entries_question ON qa_entries(question);
CREATE INDEX IF NOT EXISTS idx_qa_entries_status ON qa_entries(status);
CREATE INDEX IF NOT EXISTS idx_chat_logs_building_id ON chat_logs(building_id);