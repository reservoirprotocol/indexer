import { MigrationInterface, QueryRunner } from "typeorm";
export class SeaportV12OrderKind1675345304827 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'seaport-v1.2';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
