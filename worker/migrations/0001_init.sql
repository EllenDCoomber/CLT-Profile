-- CLT Profile responses table
CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('leader', 'member')),
  company TEXT NOT NULL,
  department TEXT NOT NULL,
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_responses_created_at ON responses(created_at);
