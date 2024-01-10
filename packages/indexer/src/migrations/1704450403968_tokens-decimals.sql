-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "decimals" SMALLINT;

-- Down Migration

ALTER TABLE "tokens" DROP COLUMN "decimals";