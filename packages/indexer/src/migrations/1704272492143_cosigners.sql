-- Up Migration

CREATE TABLE "cosigners" (
  "signer" BYTEA NOT NULL,
  "endpoint" TEXT NOT NULL,
  "api_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE "cosigners"
  ADD CONSTRAINT "cosigners_pk"
  PRIMARY KEY ("signer");

-- Down Migration

DROP TABLE "cosigners";
