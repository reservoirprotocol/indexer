-- Up Migration

ALTER TABLE "sources_v2" ADD COLUMN "domain_hash" TEXT NOT NULL;

CREATE UNIQUE INDEX "sources_domain_hash_unique_index"
  ON "sources_v2" ("domain_hash");

-- Down Migration

ALTER TABLE "sources_v2" DROP COLUMN "domain_hash";