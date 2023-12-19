-- Up Migration
CREATE TYPE "fill_event_kind" AS ENUM (
  'mint',
  'burn',
  'airdrop'
);

ALTER TABLE "fill_events_2" ADD COLUMN "kind" "fill_event_kind";

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "kind";

DROP TYPE "fill_event_kind";
