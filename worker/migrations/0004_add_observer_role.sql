-- SQLite cannot alter a CHECK constraint in place, so rebuild the responses
-- table while preserving every existing response and index.
CREATE TABLE responses_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('leader', 'member', 'observer')),
  company TEXT NOT NULL,
  department TEXT NOT NULL,
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  assessment TEXT NOT NULL DEFAULT ''
);

INSERT INTO responses_new (id, role, company, department, answers, created_at, assessment)
SELECT id, role, company, department, answers, created_at, assessment FROM responses;

DROP TABLE responses;
ALTER TABLE responses_new RENAME TO responses;

CREATE INDEX idx_responses_created_at ON responses(created_at);
CREATE INDEX idx_responses_assessment ON responses(assessment);
