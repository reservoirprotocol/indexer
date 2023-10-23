import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsFoundation1690026722375 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'foundation';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
