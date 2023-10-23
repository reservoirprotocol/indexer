import { MigrationInterface, QueryRunner } from "typeorm";
export class BlurV2OrderKind1688621662665 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'blur-v2';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
