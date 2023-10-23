import { MigrationInterface, QueryRunner } from "typeorm";
export class BlendOrderKind1684480187533 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'blend';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
