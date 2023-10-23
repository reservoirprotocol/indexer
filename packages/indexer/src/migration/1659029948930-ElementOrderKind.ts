import { MigrationInterface, QueryRunner } from "typeorm";
export class ElementOrderKind1659029948930 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'element-erc721';
ALTER TYPE "order_kind_t" ADD VALUE 'element-erc1155';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
