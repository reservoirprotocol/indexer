-- Up Migration

CREATE TABLE "removed_attribute_keys" (
  "id" BIGINT NOT NULL,
  "collection_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" "attribute_key_kind_t" NOT NULL,
  "rank" INT,
  "attribute_count" INT NOT NULL,
  "info" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL,
  "deleted_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "removed_attribute_keys"
  ADD CONSTRAINT "removed_attribute_keys_pk"
  PRIMARY KEY ("id");

CREATE TABLE "removed_attributes" (
  "id" BIGINT NOT NULL,
  "attribute_key_id" INT NOT NULL,
  "value" TEXT NOT NULL,
  "token_count" INT NOT NULL,
  "on_sale_count" INT NOT NULL,
  "floor_sell_value" NUMERIC(78, 0),
  "top_buy_value" NUMERIC(78, 0),
  "sell_updated_at" TIMESTAMPTZ,
  "buy_updated_at" TIMESTAMPTZ,
  "sample_images" TEXT[],
  "collection_id" TEXT,
  "kind" "attribute_key_kind_t",
  "key" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL,
  "deleted_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "removed_attributes"
  ADD CONSTRAINT "removed_attributes_pk"
  PRIMARY KEY ("id");

CREATE TABLE "removed_token_attributes" (
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "attribute_id" BIGINT NOT NULL,
  "collection_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "deleted_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "removed_token_attributes"
  ADD CONSTRAINT "removed_token_attributes_pk"
  PRIMARY KEY ("contract", "token_id", "attribute_id");

-- Down Migration

DROP TABLE "removed_token_attributes";

DROP TABLE "removed_attributes";

DROP TABLE "removed_attribute_keys";
