-- Up Migration

ALTER TABLE "collection_mints" DROP CONSTRAINT "collection_mints_pk";
ALTER TABLE collection_mints ADD COLUMN "id" BIGSERIAL;
ALTER TABLE "collection_mints" ADD CONSTRAINT "collection_mints_pk" PRIMARY KEY ("id");

-- Down Migration