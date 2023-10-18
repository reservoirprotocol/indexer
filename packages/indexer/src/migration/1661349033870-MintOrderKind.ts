import { MigrationInterface, QueryRunner } from "typeorm";
export class MintOrderKind1661349033870 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'mint';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
