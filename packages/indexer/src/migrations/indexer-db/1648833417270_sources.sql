-- Up Migration

CREATE TABLE "sources_v2" (
  "id" SERIAL PRIMARY KEY,
  "domain" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "metadata" JSONB NOT NULL
);

CREATE UNIQUE INDEX "sources_domain_unique_index"
  ON "sources_v2" ("domain");

CREATE UNIQUE INDEX "sources_name_unique_index"
  ON "sources_v2" ("name");

CREATE UNIQUE INDEX "sources_address_unique_index"
  ON "sources_v2" ("address");

-- Down Migration

DROP TABLE "sources_v2";
