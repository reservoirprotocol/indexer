import { MigrationInterface, QueryRunner } from "typeorm";
export class UniverseOrderKind1661847955331 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'universe';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
