-- Up Migration

ALTER TABLE "contracts" ADD COLUMN "symbol" TEXT;
ALTER TABLE "contracts" ADD COLUMN "name" TEXT;

-- Down Migration

ALTER TABLE "contracts" DROP COLUMN "symbol";
ALTER TABLE "contracts" DROP COLUMN "name";
