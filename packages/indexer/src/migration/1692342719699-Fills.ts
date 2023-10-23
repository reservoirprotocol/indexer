import { MigrationInterface, QueryRunner } from "typeorm";
export class Fills1692342719699 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "fill_events_2" ADD COLUMN "comment" TEXT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fill_events_2" DROP COLUMN "comment";`);
  }
}
