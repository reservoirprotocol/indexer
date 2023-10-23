import { MigrationInterface, QueryRunner } from "typeorm";
export class CurrenciesAndPrices1659435546006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "currencies" (
  "contract" BYTEA NOT NULL,
  "name" TEXT,
  "symbol" TEXT,
  "decimals" SMALLINT,
  "metadata" JSONB
);

ALTER TABLE "currencies"
  ADD CONSTRAINT "currencies_pk"
  PRIMARY KEY ("contract");

CREATE TABLE "usd_prices" (
  "currency" BYTEA NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "value" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "usd_prices"
  ADD CONSTRAINT "usd_prices_pk"
  PRIMARY KEY ("currency", "timestamp");

ALTER TABLE "fill_events_2" ADD COLUMN "currency" BYTEA NOT NULL DEFAULT ('\\x0000000000000000000000000000000000000000');
ALTER TABLE "fill_events_2" ADD COLUMN "currency_price" NUMERIC(78, 0);
ALTER TABLE "fill_events_2" ADD COLUMN "usd_price" NUMERIC(78, 0);

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fill_events_2" DROP COLUMN "usd_price";
ALTER TABLE "fill_events_2" DROP COLUMN "currency_price";
ALTER TABLE "fill_events_2" DROP COLUMN "currency";

DROP TABLE "prices";

DROP TABLE "currencies";`
    );
  }
}
