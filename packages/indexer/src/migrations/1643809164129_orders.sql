-- Up Migration

CREATE TYPE "order_kind_t" AS ENUM (
  'wyvern-v2',
  'wyvern-v2.3',
  'looks-rare',
  'opendao-erc721',
  'opendao-erc1155',
  'zeroex-v4-erc721',
  'zeroex-v4-erc1155',
  'foundation',
  'x2y2',
  'seaport'
);

CREATE TYPE "order_side_t" AS ENUM (
  'buy',
  'sell'
);

CREATE TYPE "order_fillability_status_t" AS ENUM (
  'fillable',
  'no-balance',
  'cancelled',
  'filled',
  'expired'
);

CREATE TYPE "order_approval_status_t" AS ENUM (
  'approved',
  'no-approval',
  'disabled'
);

CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "kind" "order_kind_t" NOT NULL,
  "side" "order_side_t",
  "fillability_status" "order_fillability_status_t",
  "approval_status" "order_approval_status_t",
  "token_set_id" TEXT,
  "token_set_schema_hash" BYTEA,
  "maker" BYTEA,
  "taker" BYTEA,
  "price" NUMERIC(78, 0),
  "value" NUMERIC(78, 0),
  "quantity_filled" NUMERIC(78, 0) DEFAULT 0,
  "quantity_remaining" NUMERIC(78, 0) DEFAULT 1,
  "valid_between" TSTZRANGE,
  "nonce" NUMERIC(78, 0),
  "source_id" BYTEA,
  "source_id_int" INT,
  "contract" BYTEA,
  "conduit" BYTEA,
  "fee_bps" INT,
  "fee_breakdown" JSONB,
  "dynamic" BOOLEAN,
  "raw_data" JSONB,
  "is_reservoir" BOOLEAN,
  "expiration" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_pk"
  PRIMARY KEY ("id");

CREATE INDEX "orders_token_set_id_side_value_maker_index"
  ON "orders" ("token_set_id", "side", "value", "maker")
  INCLUDE ("id")
  WHERE ("fillability_status" = 'fillable' AND "approval_status" = 'approved');

CREATE INDEX "orders_maker_side_token_set_id_index"
  ON "orders" ("maker", "side", "token_set_id")
  INCLUDE ("id")
  WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance');

CREATE INDEX "orders_upper_valid_between_index"
  ON "orders" (UPPER("valid_between"))
  INCLUDE ("id")
  WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance');

CREATE INDEX "orders_maker_side_conduit_index"
  ON "orders" ("maker", "side", "conduit")
  WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance' OR "fillability_status" = 'filled');

CREATE INDEX "orders_kind_maker_nonce_full_index"
  ON "orders" ("kind", "maker", "nonce")
  WHERE ("contract" IS NOT NULL);

CREATE INDEX "orders_not_expired_maker_side_created_at_id_index"
  ON "orders" ("maker", "side", "created_at" DESC, "id" DESC)
  INCLUDE ("approval_status")
  WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance');

-- TODO: Only index active orders (fillable + approved)
CREATE INDEX "orders_dynamic_index"
  ON "orders" ("id")
  WHERE ("dynamic" AND ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance'));

CREATE INDEX "orders_side_created_at_id_index"
  ON "orders" ("side", "created_at" DESC, "id" DESC)
  WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance');

CREATE INDEX orders_side_value_source_id_int_contract_index
  ON public.orders USING btree
  (side, value ASC NULLS LAST, source_id_int ASC NULLS LAST, contract)
  WHERE fillability_status = 'fillable' AND approval_status = 'approved';

CREATE INDEX "orders_side_contract_created_at_id_index"
  ON "orders" ("side", "contract", "created_at" DESC, "id" DESC)
  WHERE ("fillability_status" = 'fillable' AND "approval_status" = 'approved');

CREATE INDEX "orders_expired_bids_updated_at_id_index"
  ON "orders" ("updated_at", "id")
  WHERE ("side" = 'buy' AND "fillability_status" = 'expired');

CREATE INDEX "orders_updated_at_id_index"
  ON "orders" ("updated_at", "id");

CREATE INDEX "orders_side_contract_created_at_index"
  ON "orders" ("side", "contract", "created_at" DESC, "id" DESC);

CREATE INDEX orders_token_set_id_source_id_int_side_created_at_index
  ON public.orders USING btree (token_set_id, source_id_int, side, created_at);

-- https://stackoverflow.com/questions/51818949/is-there-any-adverse-effect-on-db-if-i-set-autovacuum-scale-factor-to-zero-for-c
-- https://www.cybertec-postgresql.com/en/tuning-autovacuum-postgresql/
ALTER TABLE "orders" SET (
  autovacuum_vacuum_cost_delay=0,
  autovacuum_vacuum_cost_limit=2000,
  autovacuum_vacuum_scale_factor=0.01,
  autovacuum_analyze_scale_factor=0.0,
  autovacuum_analyze_threshold=100000
);

CREATE INDEX "orders_asks_updated_at_asc_id_index"
  ON "orders" ("updated_at" ASC, "id" ASC)
  WHERE ("side" = 'sell');

CREATE INDEX "orders_updated_at_asc_id_active_index"
  ON "orders" ("side", "updated_at" ASC, "id" ASC)
  WHERE ("fillability_status" = 'fillable' AND "approval_status" = 'approved');

CREATE INDEX "orders_bids_updated_at_asc_id_index"
  ON "orders" ("updated_at" ASC, "id" ASC)
  WHERE ("side" = 'buy');

CREATE INDEX "orders_side_contract_updated_at_index"
  ON "orders" ("side", "contract", "updated_at" DESC, "id" DESC);

-- CREATE INDEX "orders_side_contract_updated_at_id_index"
--   ON "orders" ("side", "contract", "updated_at" DESC, "id" DESC)
--   WHERE ("fillability_status" = 'fillable' AND "approval_status" = 'approved');

-- Down Migration

DROP TABLE "orders";

DROP TYPE "order_approval_status_t";

DROP TYPE "order_fillability_status_t";

DROP TYPE "order_side_t";

DROP TYPE "order_kind_t";