import { MigrationInterface, QueryRunner } from "typeorm";
export class CaviarV1OrderKind1687538939079 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'caviar-v1';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
