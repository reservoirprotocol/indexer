import { MigrationInterface, QueryRunner } from "typeorm";
export class ImprovedTransactions1657788711516 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "transactions" ADD COLUMN "block_number" INT;
ALTER TABLE "transactions" ADD COLUMN "block_timestamp" INT;
ALTER TABLE "transactions" ADD COLUMN "gas_used" NUMERIC;
ALTER TABLE "transactions" ADD COLUMN "gas_price" NUMERIC;
ALTER TABLE "transactions" ADD COLUMN "gas_fee" NUMERIC;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "gas_fee";
ALTER TABLE "transactions" DROP COLUMN "gas_price";
ALTER TABLE "transactions" DROP COLUMN "gas_used";
ALTER TABLE "transactions" DROP COLUMN "block_timestamp";
ALTER TABLE "transactions" DROP COLUMN "block_number";`
    );
  }
}
