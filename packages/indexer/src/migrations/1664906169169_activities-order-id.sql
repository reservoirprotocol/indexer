-- Up Migration

ALTER TABLE "activities" ADD COLUMN "order_id" TEXT;
ALTER TABLE "user_activities" ADD COLUMN "order_id" TEXT;

-- Down Migration

ALTER TABLE "activities" DROP COLUMN "order_id";
ALTER TABLE "user_activities" DROP COLUMN "order_id";
