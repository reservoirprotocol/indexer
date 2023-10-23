import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsImprovementsFixes1686909398072 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'zora';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
