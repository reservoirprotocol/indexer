import { MigrationInterface, QueryRunner } from "typeorm";
export class OrdersCurrencyNormalizedValue1667837757239 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "orders" ADD COLUMN "currency_normalized_value" NUMERIC(78, 0);

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "currency_normalized_value" NUMERIC(78, 0);`
    );
  }
}
