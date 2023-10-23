import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsImprovements1686740313110 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_kind_t" ADD VALUE 'zora';

ALTER TABLE "collection_mints" ADD COLUMN "max_supply" NUMERIC(78, 0);

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
