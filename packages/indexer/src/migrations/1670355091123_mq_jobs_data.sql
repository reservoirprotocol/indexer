-- Up Migration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "mq_jobs_data" (
  id uuid DEFAULT uuid_generate_v4 (),
  queue_name TEXT,
  "data" JSONB NOT NULL,
  PRIMARY KEY (id)
);

-- Down Migration

DROP TABLE "mq_jobs_data";
