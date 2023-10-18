import { MigrationInterface, QueryRunner } from "typeorm";
export class AddBendDaoOrderKindCopy1671189653542 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'bend-dao';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
