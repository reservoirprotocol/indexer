import { MigrationInterface, QueryRunner } from "typeorm";
export class NftxOrderKind1662461545909 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'nftx';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
