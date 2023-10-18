import { MigrationInterface, QueryRunner } from "typeorm";
export class AddSuperrareOrderKind1671437869591 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'superrare';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
