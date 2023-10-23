import { MigrationInterface, QueryRunner } from "typeorm";
export class TreasureOrderKind1680248619158 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'treasure';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
