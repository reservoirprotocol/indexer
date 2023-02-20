-- Up Migration

ALTER TABLE "orders" ADD COLUMN "originated_at" TIMESTAMPTZ;

-- Down Migration

ALTER TABLE "orders" DROP COLUMN "originated_at";