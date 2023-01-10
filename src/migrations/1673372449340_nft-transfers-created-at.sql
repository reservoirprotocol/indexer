-- Up Migration

ALTER TABLE "nft_transfer_events" ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT now();

-- Down Migration

ALTER TABLE "nft_transfer_events" DROP COLUMN "created_at";
