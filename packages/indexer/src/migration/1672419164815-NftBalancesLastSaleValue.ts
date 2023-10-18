import { MigrationInterface, QueryRunner } from "typeorm";
export class NftBalancesLastSaleValue1672419164815 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "nft_balances" ADD COLUMN "last_sale_value" NUMERIC(78, 0);
ALTER TABLE "nft_balances" ADD COLUMN "last_sale_timestamp" INT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "nft_balances" DROP COLUMN "last_sale_value";
ALTER TABLE "nft_balances" DROP COLUMN "last_sale_timestamp";`
    );
  }
}
