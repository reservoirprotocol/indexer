import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsCreatedotfun1697469705537 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'createdotfun';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
