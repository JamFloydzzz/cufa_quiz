CREATE TABLE quiz_editions (
  edition INTEGER PRIMARY KEY,
  config TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE quiz_results ADD COLUMN edition INTEGER NOT NULL DEFAULT 0;
