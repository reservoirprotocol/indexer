import { MigrationInterface, QueryRunner } from "typeorm";
export class OpenseaWebsocketEvents1668531515142 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "opensea_websocket_events" (
  "event_type" TEXT NOT NULL,
  "event_timestamp" TIMESTAMPTZ NOT NULL,
  "order_hash" TEXT,
  "maker" TEXT,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "opensea_websocket_events_order_hash_index"
  ON "opensea_websocket_events" ("order_hash");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "opensea_websocket_events";`);
  }
}
