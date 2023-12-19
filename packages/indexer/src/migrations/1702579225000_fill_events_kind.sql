-- Up Migration
CREATE TYPE "fill_event_kind" AS ENUM (
  'mint',
  'burn',
  'airdrop'
);

ALTER TYPE "fill_events_2" ADD COLUMN "kind" "fill_event_kind";

-- Down Migration

ALTER TYPE "fill_events_2" DROP COLUMN "kind";