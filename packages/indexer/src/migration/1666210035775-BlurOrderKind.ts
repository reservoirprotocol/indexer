import { MigrationInterface, QueryRunner } from "typeorm";
export class BlurOrderKind1666210035775 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'blur';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
