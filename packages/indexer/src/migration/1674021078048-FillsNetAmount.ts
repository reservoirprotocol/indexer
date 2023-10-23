import { MigrationInterface, QueryRunner } from "typeorm";
export class FillsNetAmount1674021078048 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "fill_events_2" ADD COLUMN "net_amount" NUMERIC(78, 0);

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fill_events_2" DROP COLUMN "net_amount";`);
  }
}
