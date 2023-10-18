import { MigrationInterface, QueryRunner } from "typeorm";
export class SeaportV14OrderKind1677090460841 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'seaport-v1.4';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
