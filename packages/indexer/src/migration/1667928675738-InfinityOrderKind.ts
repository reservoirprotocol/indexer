import { MigrationInterface, QueryRunner } from "typeorm";
export class InfinityOrderKind1667928675738 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'infinity';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
