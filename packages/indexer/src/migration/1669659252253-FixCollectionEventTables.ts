import { MigrationInterface, QueryRunner } from "typeorm";
export class FixCollectionEventTables1669659252253 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collection_normalized_floor_sell_events"
  ALTER "contract" DROP NOT NULL,
  ALTER "token_id" DROP NOT NULL;

ALTER TABLE "collection_top_bid_events"
  ALTER "contract" DROP NOT NULL,
  ALTER "token_set_id" DROP NOT NULL;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
