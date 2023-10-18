import { MigrationInterface, QueryRunner } from "typeorm";
export class SudoswapOrderKind1662382158706 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'sudoswap';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
