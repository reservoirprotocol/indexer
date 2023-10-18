import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsManifold1686917974468 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'manifold';

ALTER TABLE "collection_mints" ADD COLUMN "token_id" NUMERIC(78, 0);

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
