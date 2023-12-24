-- Up Migration

ALTER TABLE "api_keys" ADD COLUMN "rev_share_bps" INT;

-- Down Migration

ALTER TABLE "api_keys" DROP COLUMN "rev_share_bps";