-- Up Migration

CREATE TABLE "collections_override" (
  "collection_id" TEXT,
  "metadata" JSONB,
  "royalties" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "collections_override"
  ADD CONSTRAINT "collections_override_pk"
  PRIMARY KEY ("collection_id");

-- Down Migration

DROP TABLE "collections_override";