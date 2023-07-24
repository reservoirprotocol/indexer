-- Up Migration

CREATE TYPE "execution_action_t" AS ENUM (
  'create',
  'fill'
);

CREATE TABLE "executions" (
  "id" BIGSERIAL NOT NULL,
  "request_id" UUID NOT NULL,
  "request_data" JSONB NOT NULL,
  "api_key" TEXT,
  "side" order_side_t NOT NULL,
  "action" execution_action_t NOT NULL,
  "user" BYTEA NOT NULL,
  "order_id" TEXT NOT NULL,
  "quantity" INT NOT NULL,
  "calldata" BYTEA,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "executions"
  ADD CONSTRAINT "executions_pk"
  PRIMARY KEY ("id");

-- Down Migration

DROP TABLE "executions";
DROP TYPE "execution_action_t";