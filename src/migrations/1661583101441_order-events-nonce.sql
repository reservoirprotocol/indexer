-- Up Migration

ALTER TABLE "order_events" ADD COLUMN "order_nonce" NUMERIC(78, 0);
ALTER TABLE "bid_events" ADD COLUMN "order_nonce" NUMERIC(78, 0);

-- Down Migration

ALTER TABLE "bid_events" DROP COLUMN "order_nonce";
ALTER TABLE "order_events" DROP COLUMN "order_nonce";