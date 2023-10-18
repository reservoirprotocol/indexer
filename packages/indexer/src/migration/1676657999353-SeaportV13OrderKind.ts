import { MigrationInterface, QueryRunner } from "typeorm";
export class SeaportV13OrderKind1676657999353 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'seaport-v1.3';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
