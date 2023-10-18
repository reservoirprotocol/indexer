import { MigrationInterface, QueryRunner } from "typeorm";
export class ForwardOrderKind1666776739846 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'forward';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
