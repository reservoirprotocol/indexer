-- Up Migration

CREATE TABLE "off_chain_cancellations" (
  "order_id" TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL
);

ALTER TABLE "off_chain_cancellations"
  ADD CONSTRAINT "off_chain_cancellations_pk"
  PRIMARY KEY ("order_id");

-- Down Migration

DROP TABLE "off_chain_cancellations";