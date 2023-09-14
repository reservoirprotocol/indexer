-- Up Migration

CREATE TYPE "fee_kind_t" AS ENUM (
  'marketplace',
  'royalty'
);

CREATE TABLE "fee_recipients" (
  "address" BYTEA NOT NULL,
  "kind" "fee_kind_t" NOT NULL,
  "source_id" INT
);

ALTER TABLE "fee_recipients"
  ADD CONSTRAINT "fee_recipients_pk"
  PRIMARY KEY ("address", "kind");

-- Down Migration

DROP TABLE "fee_recipients";
DROP TYPE "fee_kind_t";