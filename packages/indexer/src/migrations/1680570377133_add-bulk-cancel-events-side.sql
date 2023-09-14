-- Up Migration

ALTER TABLE "bulk_cancel_events" ADD COLUMN "side" "order_side_t" DEFAULT NULL;

-- Down Migration

ALTER TABLE "bulk_cancel_events" DROP COLUMN "side";