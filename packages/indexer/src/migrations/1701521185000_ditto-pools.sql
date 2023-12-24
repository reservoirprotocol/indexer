-- Up Migration

CREATE TABLE "ditto_pools" (
  "address" BYTEA NOT NULL,
  "template" BYTEA NOT NULL,
  "lp_nft" BYTEA NOT NULL,
  "permitter" BYTEA NOT NULL
);

ALTER TABLE "ditto_pools"
  ADD CONSTRAINT "ditto_pools_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "ditto_pools";