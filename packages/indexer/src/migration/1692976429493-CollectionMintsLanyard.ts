import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsLanyard1692976429493 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'lanyard';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
