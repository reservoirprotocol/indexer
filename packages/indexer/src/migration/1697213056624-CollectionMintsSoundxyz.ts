import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsSoundxyz1697213056624 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'soundxyz';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
