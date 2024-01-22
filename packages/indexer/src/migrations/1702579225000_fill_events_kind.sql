-- Up Migration
CREATE TYPE "transfer_event_kind" AS ENUM (
  'mint',
  'burn',
  'airdrop'
);

ALTER TABLE "nft_transfer_events" ADD COLUMN "kind" "transfer_event_kind";

ALTER TABLE "nft_balances" ADD COLUMN "is_airdropped" BOOLEAN;

-- Down Migration

ALTER TABLE "nft_transfer_events" DROP COLUMN "kind";

DROP TYPE "transfer_event_kind";
