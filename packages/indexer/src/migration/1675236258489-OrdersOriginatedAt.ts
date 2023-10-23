import { MigrationInterface, QueryRunner } from "typeorm";
export class OrdersOriginatedAt1675236258489 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "orders" ADD COLUMN "originated_at" TIMESTAMPTZ;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "originated_at";`);
  }
}
