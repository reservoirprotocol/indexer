import { MigrationInterface, QueryRunner } from "typeorm";
export class Add0XV3OrderKind1680530058943 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'zeroex-v3';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
