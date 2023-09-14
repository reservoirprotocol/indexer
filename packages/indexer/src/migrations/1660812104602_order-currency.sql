-- Up Migration

ALTER TABLE "orders" ADD COLUMN "currency" BYTEA NOT NULL DEFAULT ('\x0000000000000000000000000000000000000000');
ALTER TABLE "orders" ADD COLUMN "currency_price" NUMERIC(78, 0);
ALTER TABLE "orders" ADD COLUMN "currency_value" NUMERIC(78, 0);
ALTER TABLE "orders" ADD COLUMN "needs_conversion" BOOLEAN;

ALTER TABLE "tokens" ADD COLUMN "floor_sell_currency" BYTEA;
ALTER TABLE "tokens" ADD COLUMN "floor_sell_currency_value" NUMERIC(78, 0);

CREATE INDEX "orders_conversion_index"
  ON "orders" ("id")
  WHERE ("needs_conversion" AND "fillability_status" = 'fillable' AND "approval_status" = 'approved');

CREATE INDEX "tokens_contract_floor_sell_value_floor_sell_currency_index"
  ON "tokens" ("contract", "floor_sell_value", "floor_sell_currency");

-- Down Migration

DROP INDEX "orders_conversion_index";

DROP INDEX "tokens_contract_floor_sell_value_floor_sell_currency_index";

ALTER TABLE "tokens" DROP COLUMN "floor_sell_currency_value";
ALTER TABLE "tokens" DROP COLUMN "floor_sell_currency";

ALTER TABLE "orders" DROP COLUMN "needs_conversion";
ALTER TABLE "orders" DROP COLUMN "currency_value";
ALTER TABLE "orders" DROP COLUMN "currency_price";
ALTER TABLE "orders" DROP COLUMN "currency";
