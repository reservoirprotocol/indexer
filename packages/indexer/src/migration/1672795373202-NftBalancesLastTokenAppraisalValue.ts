import { MigrationInterface, QueryRunner } from "typeorm";
export class NftBalancesLastTokenAppraisalValue1672795373202 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "nft_balances" ADD COLUMN "last_token_appraisal_value" NUMERIC(78, 0);

CREATE INDEX "nft_balances_owner_last_token_appraisal_value_index"
ON "nft_balances" ("owner", "last_token_appraisal_value" DESC NULLS LAST)
WHERE ("amount" > 0);

ALTER TABLE "nft_balances" DROP COLUMN "last_sale_value";
ALTER TABLE "nft_balances" DROP COLUMN "last_sale_timestamp";

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "nft_balances" DROP COLUMN "last_token_appraisal_value";`);
  }
}
