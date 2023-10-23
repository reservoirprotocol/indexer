import { MigrationInterface, QueryRunner } from "typeorm";
export class OrderEventsRawData1676471038531 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "order_events"
  ADD COLUMN "order_kind" "order_kind_t",
  ADD COLUMN "order_token_set_id" TEXT,
  ADD COLUMN "order_dynamic" BOOLEAN,
  ADD COLUMN "order_currency" BYTEA,
  ADD COLUMN "order_currency_price" NUMERIC(78, 0),
  ADD COLUMN "order_normalized_value" NUMERIC(78, 0),
  ADD COLUMN "order_currency_normalized_value" NUMERIC(78, 0),
  ADD COLUMN "order_raw_data" JSONB;

ALTER TABLE "bid_events"
  ADD COLUMN "order_kind" "order_kind_t",
  ADD COLUMN "order_currency" BYTEA,
  ADD COLUMN "order_currency_price" NUMERIC(78, 0),
  ADD COLUMN "order_normalized_value" NUMERIC(78, 0),
  ADD COLUMN "order_currency_normalized_value" NUMERIC(78, 0),
  ADD COLUMN "order_raw_data" JSONB;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
