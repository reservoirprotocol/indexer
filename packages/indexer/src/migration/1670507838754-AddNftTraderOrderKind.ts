import { MigrationInterface, QueryRunner } from "typeorm";
export class AddNftTraderOrderKind1670507838754 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'nft-trader';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
