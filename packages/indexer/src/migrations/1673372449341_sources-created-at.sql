-- Up Migration

ALTER TABLE "sources_v2" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration

ALTER TABLE "sources_v2" DROP COLUMN "created_at";
