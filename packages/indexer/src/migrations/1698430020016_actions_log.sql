-- Up Migration

CREATE TABLE "actions_log" (
  "id" BIGSERIAL NOT NULL,
  "context" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "action_taker_identifier" TEXT NOT NULL,
  "contract" BYTEA,
  "collection_id" TEXT,
  "token_id" NUMERIC(78, 0),
  "data" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "actions_log"
  ADD CONSTRAINT "actions_log_pk"
  PRIMARY KEY ("id");

CREATE INDEX "actions_log_context_collection_id_created_at"
  ON "actions_log" ("context", "collection_id", "created_at");

CREATE INDEX "actions_log_context_contract_token_id_created_at"
  ON "actions_log" ("context", "contract", "token_id", "created_at");

CREATE INDEX "actions_log_action_taker_identifier_created_at"
  ON "actions_log" ("action_taker_identifier", "created_at");

-- Down Migration

DROP TABLE "actions_log";