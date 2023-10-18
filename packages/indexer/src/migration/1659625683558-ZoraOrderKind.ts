import { MigrationInterface, QueryRunner } from "typeorm";
export class ZoraOrderKind1659625683558 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'zora-v3';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
