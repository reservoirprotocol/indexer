import { MigrationInterface, QueryRunner } from "typeorm";
export class AddBulkCancelEventsSide1680570377133 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "bulk_cancel_events" ADD COLUMN "side" "order_side_t" DEFAULT NULL;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bulk_cancel_events" DROP COLUMN "side";`);
  }
}
