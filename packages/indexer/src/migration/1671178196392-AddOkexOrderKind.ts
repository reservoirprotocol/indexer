import { MigrationInterface, QueryRunner } from "typeorm";
export class AddOkexOrderKind1671178196392 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'okex';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
