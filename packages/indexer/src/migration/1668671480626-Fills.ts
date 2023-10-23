import { MigrationInterface, QueryRunner } from "typeorm";
export class Fills1668671480626 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "fill_events_2" ADD COLUMN "royalty_fee_bps" INT;

ALTER TABLE "fill_events_2" ADD COLUMN "marketplace_fee_bps" INT;

ALTER TABLE "fill_events_2" ADD COLUMN "royalty_fee_breakdown" JSONB;

ALTER TABLE "fill_events_2" ADD COLUMN "marketplace_fee_breakdown" JSONB;

ALTER TABLE "fill_events_2" ADD COLUMN "paid_full_royalty" BOOLEAN;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fill_events_2" DROP COLUMN "royalty_fee_bps";

ALTER TABLE "fill_events_2" DROP COLUMN "marketplace_fee_bps";

ALTER TABLE "fill_events_2" DROP COLUMN "royalty_fee_breakdown";

ALTER TABLE "fill_events_2" DROP COLUMN "marketplace_fee_breakdown";

ALTER TABLE "fill_events_2" DROP COLUMN "paid_full_royalty";`
    );
  }
}
