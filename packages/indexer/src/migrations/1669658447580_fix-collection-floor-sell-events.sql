-- Up Migration

ALTER TABLE "collection_floor_sell_events"
  ALTER "contract" DROP NOT NULL,
  ALTER "token_id" DROP NOT NULL;

-- Down Migration