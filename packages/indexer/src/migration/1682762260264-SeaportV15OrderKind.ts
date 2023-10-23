import { MigrationInterface, QueryRunner } from "typeorm";
export class SeaportV15OrderKind1682762260264 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'seaport-v1.5';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
