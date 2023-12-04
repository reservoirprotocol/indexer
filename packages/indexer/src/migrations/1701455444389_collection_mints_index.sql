-- Up Migration

CREATE INDEX "collection_mints_kind_status_price_index"
  ON "collection_mints" ("kind", "status", "price")
  WHERE "kind" = 'public' AND "status" = 'open';


-- Down Migration