-- Up Migration

ALTER TABLE "collection_mints" ALTER COLUMN "price" DROP NOT NULL;

CREATE INDEX "allowlists_items_allowlist_id_address_index"
  ON "allowlists_items" ("allowlist_id", "address");

-- Down Migration