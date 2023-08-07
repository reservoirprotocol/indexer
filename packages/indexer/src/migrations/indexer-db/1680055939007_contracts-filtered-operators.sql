-- Up Migration

ALTER TABLE "contracts" ADD COLUMN "filtered_operators" JSONB;

-- Down Migration

ALTER TABLE "contracts" DROP COLUMN "filtered_operators";