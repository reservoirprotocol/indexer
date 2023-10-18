import { MigrationInterface, QueryRunner } from "typeorm";
export class ActivitiesOrderId1664906169169 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "activities" ADD COLUMN "order_id" TEXT;
ALTER TABLE "user_activities" ADD COLUMN "order_id" TEXT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activities" DROP COLUMN "order_id";
ALTER TABLE "user_activities" DROP COLUMN "order_id";`
    );
  }
}
