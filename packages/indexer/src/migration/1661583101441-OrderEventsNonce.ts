import { MigrationInterface, QueryRunner } from "typeorm";
export class OrderEventsNonce1661583101441 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "order_events" ADD COLUMN "order_nonce" NUMERIC(78, 0);
ALTER TABLE "bid_events" ADD COLUMN "order_nonce" NUMERIC(78, 0);

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bid_events" DROP COLUMN "order_nonce";
ALTER TABLE "order_events" DROP COLUMN "order_nonce";`
    );
  }
}
