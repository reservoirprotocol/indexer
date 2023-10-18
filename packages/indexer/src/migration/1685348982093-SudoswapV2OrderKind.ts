import { MigrationInterface, QueryRunner } from "typeorm";
export class SudoswapV2OrderKind1685348982093 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'sudoswap-v2';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
