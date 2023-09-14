-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "last_flag_change" TIMESTAMPTZ;

CREATE INDEX "tokens_last_flag_change_is_flagged_index"
  ON "tokens" ("last_flag_change" DESC NULLS LAST, "is_flagged");

-- Down Migration