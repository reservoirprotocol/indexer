import { MigrationInterface, QueryRunner } from "typeorm";
export class AddTofuOrderKind1670830412919 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'tofu-nft';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
