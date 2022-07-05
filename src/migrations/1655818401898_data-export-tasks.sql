-- Up Migration

CREATE TABLE "data_export_tasks" (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  cursor JSONB,
  sequence_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "data_export_tasks_source_unique_index"
  ON "data_export_tasks" ("source");

-- Down Migration

DROP TABLE "data_export_tasks";