-- Up Migration

ALTER INDEX "collection_mints_pk" RENAME TO "collection_mints_unique_index";
ALTER TABLE "collection_mints" ADD CONSTRAINT "collection_mints_pk" PRIMARY KEY ("collection_id", "stage");

-- Down Migration