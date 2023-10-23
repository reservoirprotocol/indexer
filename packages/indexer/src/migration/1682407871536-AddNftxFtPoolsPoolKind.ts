import { MigrationInterface, QueryRunner } from "typeorm";
export class AddNftxFtPoolsPoolKind1682407871536 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TYPE "nftx_ft_pool_kind_t" AS ENUM (
  'sushiswap',
  'uniswap-v3'
);
ALTER TABLE "nftx_ft_pools" ADD COLUMN "pool_kind" "nftx_ft_pool_kind_t" DEFAULT 'sushiswap';

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "nftx_ft_pools" DROP COLUMN "pool_kind";
DROP TYPE "nftx_ft_pool_kind_t";`
    );
  }
}
