import { MigrationInterface, QueryRunner } from "typeorm";
export class SudoswapV2Pools1685063598297 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "sudoswap_v2_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL, 
  "token" BYTEA NOT NULL,
  "bonding_curve" BYTEA NOT NULL,
  "pool_kind" SMALLINT NOT NULL,
  "pair_kind" SMALLINT NOT NULL,
  "property_checker" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) DEFAULT NULL
);

ALTER TABLE "sudoswap_v2_pools"
  ADD CONSTRAINT "sudoswap_v2_pools_pk"
  PRIMARY KEY ("address");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sudoswap_v2_pools";`);
  }
}
