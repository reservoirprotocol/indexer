-- Up Migration

CREATE TYPE "permit_kind_t" AS ENUM (
  'eip2612'
);

CREATE TABLE "permits" (
  "id" TEXT NOT NULL,
  "index" INT NOT NULL,
  "is_valid" BOOLEAN NOT NULL,
  "kind" "permit_kind_t" NOT NULL,
  "token" BYTEA NOT NULL,
  "owner" BYTEA NOT NULL, 
  "spender" BYTEA NOT NULL, 
  "value" NUMERIC(78, 0) NOT NULL,
  "nonce" NUMERIC(78, 0) NOT NULL,
  "deadline" INT NOT NULL,
  "signature" BYTEA NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "permits"
  ADD CONSTRAINT "permits_pk"
  PRIMARY KEY ("id", "index");

CREATE INDEX "permits_token_owner_spender_index"
  ON "permits" ("token", "owner", "spender") WHERE ("is_valid");

CREATE INDEX "permits_deadline_index"
  ON "permits" ("deadline") WHERE ("is_valid");

-- Down Migration

DROP TABLE "permits";

DROP TYPE "permit_kind_t";