import { MigrationInterface, QueryRunner } from "typeorm";
export class AddDecentralandOrderKind1670917593461 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'decentraland';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
