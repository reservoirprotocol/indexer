import { MigrationInterface, QueryRunner } from "typeorm";
export class FlowOrderKind1674242825314 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'flow';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
