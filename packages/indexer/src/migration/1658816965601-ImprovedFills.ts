import { MigrationInterface, QueryRunner } from "typeorm";
export class ImprovedFills1658816965601 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `


ALTER TABLE "fill_events_2" ADD COLUMN "fill_source_id" INT;

ALTER TABLE "fill_events_2" ADD COLUMN "aggregator_source_id" INT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fill_events_2" DROP COLUMN "aggregator_source_id";

ALTER TABLE "fill_events_2" DROP COLUMN "fill_source_id";`
    );
  }
}
