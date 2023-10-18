import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsDecent1688388011952 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'decent';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
