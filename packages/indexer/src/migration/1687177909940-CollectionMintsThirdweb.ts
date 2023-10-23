import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsThirdweb1687177909940 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'thirdweb';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
