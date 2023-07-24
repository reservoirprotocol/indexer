-- Up Migration

CREATE TABLE "blocks" (
  "hash" BYTEA NOT NULL,
  "number" INT NOT NULL
);

ALTER TABLE "blocks"
  ADD CONSTRAINT "blocks_pk"
  PRIMARY KEY ("number", "hash");

-- Down Migration

DROP TABLE "blocks";