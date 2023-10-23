import { MigrationInterface, QueryRunner } from "typeorm";
export class RaribleOrderKind1659101094534 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'rarible';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
