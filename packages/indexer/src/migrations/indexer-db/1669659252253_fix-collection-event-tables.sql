-- Up Migration

ALTER TABLE "collection_normalized_floor_sell_events"
  ALTER "contract" DROP NOT NULL,
  ALTER "token_id" DROP NOT NULL;

ALTER TABLE "collection_top_bid_events"
  ALTER "contract" DROP NOT NULL,
  ALTER "token_set_id" DROP NOT NULL;

-- Down Migration