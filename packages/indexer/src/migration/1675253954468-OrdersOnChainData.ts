import { MigrationInterface, QueryRunner } from "typeorm";
export class OrdersOnChainData1675253954468 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "orders" ADD COLUMN "block_number" INT;
ALTER TABLE "orders" ADD COLUMN "log_index" INT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "log_index";
ALTER TABLE "orders" DROP COLUMN "block_number";`
    );
  }
}
