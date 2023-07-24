-- Up Migration

CREATE TYPE "cross_posting_order_status_t" AS ENUM (
  'pending',
  'posted',
  'failed'
);

CREATE TYPE "cross_posting_order_orderbook_t" AS ENUM (
  'opensea',
  'looks-rare',
  'x2y2',
  'universe',
  'infinity',
  'flow',
  'blur'
);

CREATE TABLE "cross_posting_orders" (
  "id" bigserial NOT NULL,
  "order_id" TEXT,
  "kind" "order_kind_t" NOT NULL,
  "orderbook" "cross_posting_order_orderbook_t" NOT NULL,
  "source" TEXT,
  "schema" JSONB,
  "status" "cross_posting_order_status_t" NOT NULL,
  "status_reason" TEXT,
  "raw_data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "cross_posting_orders"
  ADD CONSTRAINT "cross_posting_orders_pk"
  PRIMARY KEY ("id");

-- Down Migration

DROP TABLE "cross_posting_orders";

DROP TYPE "cross_posting_order_status_t";

DROP TYPE "cross_posting_order_orderbook_t";
