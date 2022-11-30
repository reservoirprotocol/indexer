-- Up Migration

ALTER TABLE "collections" ADD COLUMN "new_royalties_fee_bps" JSONB;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "new_royalties_fee_bps";