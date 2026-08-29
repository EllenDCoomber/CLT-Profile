-- Question sets (questionnaire payloads) and assessments (team engagements)
CREATE TABLE question_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  questions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  team_name TEXT NOT NULL,
  question_set_id TEXT NOT NULL,
  questions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE responses ADD COLUMN assessment TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_responses_assessment ON responses(assessment);
