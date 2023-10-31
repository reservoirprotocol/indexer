-- Up Migration

CREATE TABLE "general_tracking" (
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

ALTER TABLE "general_tracking"
  ADD CONSTRAINT "general_tracking_pk"
  PRIMARY KEY ("id");

CREATE INDEX "general_tracking_context_collection_id_created_at"
  ON "general_tracking" ("context", "collection_id", "created_at");

CREATE INDEX "general_tracking_context_contract_token_id_created_at"
  ON "general_tracking" ("context", "contract", "token_id", "created_at");

CREATE INDEX "general_tracking_action_taker_identifier_created_at"
  ON "general_tracking" ("action_taker_identifier", "created_at");

-- Down Migration

DROP TABLE "general_tracking";