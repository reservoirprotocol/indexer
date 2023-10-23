import { MigrationInterface, QueryRunner } from "typeorm";
export class OrdersNormalizedValue1667811460235 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "orders" ADD COLUMN "normalized_value" NUMERIC(78, 0);

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "normalized_value" NUMERIC(78, 0);`);
  }
}
