-- Up Migration

ALTER TABLE "tokens" ADD COLUMN "metadata_indexed_at" TIMESTAMPTZ;
ALTER TABLE "tokens" ADD COLUMN "metadata_initialized_at" TIMESTAMPTZ;
ALTER TABLE "tokens" ADD COLUMN "metadata_changed_at" TIMESTAMPTZ;
ALTER TABLE "tokens" ADD COLUMN "metadata_updated_at" TIMESTAMPTZ;


-- Down Migration

ALTER TABLE "tokens" DROP COLUMN "metadata_indexed_at";
ALTER TABLE "tokens" DROP COLUMN "metadata_initialized_at";
ALTER TABLE "tokens" DROP COLUMN "metadata_changed_at";
ALTER TABLE "tokens" DROP COLUMN "metadata_updated_at";
