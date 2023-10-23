import { MigrationInterface, QueryRunner } from "typeorm";
export class MidaswapOrderKind1687936565390 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'midaswap';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
