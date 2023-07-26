-- Up Migration

CREATE TABLE "routers" (
  "address" BYTEA NOT NULL,
  "source_id" INT NOT NULL
);

ALTER TABLE "routers"
  ADD CONSTRAINT "routers_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "routers";