-- Up Migration

CREATE TABLE "sources" (
  "source_id" TEXT NOT NULL,
  "metadata" JSONB NOT NULL
);

ALTER TABLE "sources"
  ADD CONSTRAINT "sources_pk"
  PRIMARY KEY ("source_id");

-- Down Migration

DROP TABLE "sources";
