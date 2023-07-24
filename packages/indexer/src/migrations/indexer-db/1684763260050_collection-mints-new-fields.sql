-- Up Migration

ALTER TABLE "collection_mints" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'public-sale';
ALTER TABLE "collection_mints" ADD COLUMN "max_mints_per_wallet" NUMERIC(78, 0);

ALTER TABLE "collection_mints" ADD COLUMN "start_time" TIMESTAMPTZ;
ALTER TABLE "collection_mints" ADD COLUMN "end_time" TIMESTAMPTZ;

ALTER TABLE "collection_mints" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "collection_mints" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "collection_mints"
  DROP CONSTRAINT "collection_mints_pk",
  ADD CONSTRAINT "collection_mints_pk" PRIMARY KEY ("collection_id", "stage");

CREATE INDEX "collection_mints_expired_index"
  ON "collection_mints" ("end_time") WHERE "end_time" IS NOT NULL AND "status" = 'open';

CREATE TYPE "collection_mint_standard_t" AS ENUM (
  'unknown',
  'seadrop-v1.0'
);

CREATE TABLE "collection_mint_standards" (
  "collection_id" TEXT NOT NULL,
  "standard" "collection_mint_standard_t" NOT NULL
);

ALTER TABLE "collection_mint_standards"
  ADD CONSTRAINT "collection_mint_standards_pk"
  PRIMARY KEY ("collection_id");

-- Down Migration