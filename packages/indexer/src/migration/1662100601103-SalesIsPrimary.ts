import { MigrationInterface, QueryRunner } from "typeorm";
export class SalesIsPrimary1662100601103 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "fill_events_2" ADD COLUMN "is_primary" BOOLEAN;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fill_events_2" DROP COLUMN "is_primary";`);
  }
}
