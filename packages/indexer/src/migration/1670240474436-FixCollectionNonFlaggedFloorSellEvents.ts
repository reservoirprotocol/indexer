import { MigrationInterface, QueryRunner } from "typeorm";
export class FixCollectionNonFlaggedFloorSellEvents1670240474436 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collection_non_flagged_floor_sell_events"
  ALTER "contract" DROP NOT NULL,
  ALTER "token_id" DROP NOT NULL;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
