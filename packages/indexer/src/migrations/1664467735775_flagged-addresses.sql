-- Up Migration

CREATE TABLE "flagged_addresses" (
  "address" BYTEA NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "flagged_addresses"
  ADD CONSTRAINT "flagged_addresses_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "flagged_addresses";