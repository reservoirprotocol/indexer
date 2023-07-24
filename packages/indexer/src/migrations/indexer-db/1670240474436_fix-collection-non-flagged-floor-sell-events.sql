-- Up Migration

ALTER TABLE "collection_non_flagged_floor_sell_events"
  ALTER "contract" DROP NOT NULL,
  ALTER "token_id" DROP NOT NULL;

-- Down Migration