import { MigrationInterface, QueryRunner } from "typeorm";
export class LooksRareV2OrderKindNew1680570377130 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'looks-rare-v2';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
