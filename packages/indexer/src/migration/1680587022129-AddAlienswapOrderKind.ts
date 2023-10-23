import { MigrationInterface, QueryRunner } from "typeorm";
export class AddAlienswapOrderKind1680587022129 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'alienswap';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
