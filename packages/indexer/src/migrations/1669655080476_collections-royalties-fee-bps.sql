-- Up Migration

ALTER TABLE "collections" DROP COLUMN "new_royalties_fee_bps";
ALTER TABLE "collections" ADD COLUMN "royalties_bps" INT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "royalties_bps";