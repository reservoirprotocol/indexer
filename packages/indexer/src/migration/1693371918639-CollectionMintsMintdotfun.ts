import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsMintdotfun1693371918639 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'mintdotfun';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
