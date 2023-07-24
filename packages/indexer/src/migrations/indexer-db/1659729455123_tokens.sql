-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "is_flagged" INT DEFAULT 0;
ALTER TABLE "tokens" ADD COLUMN "last_flag_update" TIMESTAMPTZ;

CREATE INDEX "tokens_collection_id_is_flagged_index"
  ON "tokens" ("collection_id", "is_flagged")
  INCLUDE ("token_id");

-- Down Migration