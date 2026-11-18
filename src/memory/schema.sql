-- Procedural memory store. Applied by src/memory/db.ts when PRAGMA user_version is 0.
-- Every column is documented in docs/recording-format.md.

CREATE TABLE workflows (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  task               TEXT    NOT NULL,           -- natural-language task sentence, may hold {{params}}
  intent             TEXT    NOT NULL DEFAULT '',-- one-line summary of the workflow's purpose
  start_url_pattern  TEXT    NOT NULL,           -- e.g. http://127.0.0.1:*/bookshop/
  params_json        TEXT    NOT NULL DEFAULT '{}', -- {"query":"rust"}: recorded default values
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT    NOT NULL,
  UNIQUE (name, version)
);

CREATE TABLE steps (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id    INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  idx            INTEGER NOT NULL,
  action         TEXT    NOT NULL CHECK (action IN ('navigate','click','fill','select','check','press','submit','wait_for')),
  intent         TEXT    NOT NULL DEFAULT '',
  url_pattern    TEXT    NOT NULL DEFAULT '',     -- page URL pattern this step expects
  value_template TEXT,                            -- text typed / option chosen / key pressed, may hold {{params}}
  target_json    TEXT,                            -- null for navigate; see Target in src/memory/types.ts
  created_at     TEXT    NOT NULL,
  UNIQUE (workflow_id, idx)
);

CREATE TABLE embeddings (
  text_hash TEXT    NOT NULL,
  model     TEXT    NOT NULL,
  dims      INTEGER NOT NULL,
  vector    BLOB    NOT NULL,                     -- little-endian float32 array
  PRIMARY KEY (text_hash, model)
);

CREATE TABLE runs (
  id             TEXT PRIMARY KEY,                -- uuid, also the runs/<id>/ artifact folder
  workflow_id    INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  strategy       TEXT    NOT NULL,
  mutation_level TEXT    NOT NULL DEFAULT 'none',
  seed           INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL CHECK (status IN ('running','success','failed','pending_approval','denied')),
  started_at     TEXT    NOT NULL,
  ended_at       TEXT,
  duration_ms    INTEGER
);

CREATE TABLE run_steps (
  run_id          TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  idx             INTEGER NOT NULL,
  strategy_used   TEXT    NOT NULL,               -- css | role | semantic | llm | none
  candidates_json TEXT    NOT NULL DEFAULT '[]',  -- top 5 candidates with scores
  chosen_json     TEXT,
  score           REAL,
  margin          REAL,
  retries         INTEGER NOT NULL DEFAULT 0,
  screenshot_path TEXT,
  error           TEXT,
  PRIMARY KEY (run_id, idx)
);

CREATE TABLE approvals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_idx        INTEGER NOT NULL,
  summary_json    TEXT    NOT NULL,               -- field labels and values about to be submitted
  screenshot_path TEXT,
  decision        TEXT    CHECK (decision IN ('approved','denied','timeout')),
  decided_by      TEXT,                           -- cli | mcp | benchmark-flag | timeout
  decided_at      TEXT
);

CREATE TABLE llm_calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  purpose       TEXT    NOT NULL,                 -- intent_labels | tiebreak | scratch_agent
  model         TEXT    NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL    NOT NULL,
  latency_ms    INTEGER NOT NULL,
  fixture_key   TEXT,                             -- sha256 of the request, fixture file name
  created_at    TEXT    NOT NULL
);

CREATE INDEX idx_steps_workflow ON steps(workflow_id, idx);
CREATE INDEX idx_runs_workflow  ON runs(workflow_id);
CREATE INDEX idx_approvals_run  ON approvals(run_id);
