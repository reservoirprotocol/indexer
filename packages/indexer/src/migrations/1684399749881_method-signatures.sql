-- Up Migration

CREATE TABLE "method_signatures" (
  "signature" BYTEA NOT NULL,
  "name" TEXT NOT NULL,
  "params" TEXT NOT NULL
);

ALTER TABLE "method_signatures"
  ADD CONSTRAINT "method_signatures_pk"
  PRIMARY KEY ("signature", "params");

-- Down Migration