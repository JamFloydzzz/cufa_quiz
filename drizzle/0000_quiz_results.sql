CREATE TABLE quiz_results (
  attempt TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  answered INTEGER NOT NULL,
  choices TEXT NOT NULL,
  scores TEXT NOT NULL,
  leaders TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
