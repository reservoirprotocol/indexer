import { MigrationInterface, QueryRunner } from "typeorm";
export class Fill1661781745682 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "fill_events_2" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX "fill_events_2_updated_at_tx_hash_index"
  ON "fill_events_2" ("updated_at", "tx_hash", "log_index", "batch_index");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fill_events_2" DROP COLUMN "updated_at";`);
  }
}
