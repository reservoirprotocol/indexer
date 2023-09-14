-- Up Migration

ALTER TABLE "nft_transfer_events" ADD COLUMN "created_at" TIMESTAMPTZ;
ALTER TABLE "nft_transfer_events" ALTER "created_at" SET DEFAULT now();

-- Down Migration

ALTER TABLE "nft_transfer_events" DROP COLUMN "created_at";
