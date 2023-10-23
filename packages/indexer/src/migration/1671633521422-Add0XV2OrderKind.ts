import { MigrationInterface, QueryRunner } from "typeorm";
export class Add0XV2OrderKind1671633521422 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'zeroex-v2';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
