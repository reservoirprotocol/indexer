import { MigrationInterface, QueryRunner } from "typeorm";
export class JoepegOrderKind1692261985139 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'joepeg';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
