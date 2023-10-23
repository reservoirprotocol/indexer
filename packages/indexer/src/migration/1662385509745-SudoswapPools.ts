import { MigrationInterface, QueryRunner } from "typeorm";
export class SudoswapPools1662385509745 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "sudoswap_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL,
  "token" BYTEA NOT NULL,
  "bonding_curve" BYTEA NOT NULL,
  "pool_kind" SMALLINT NOT NULL,
  "pair_kind" SMALLINT NOT NULL
);

ALTER TABLE "sudoswap_pools"
  ADD CONSTRAINT "sudoswap_pools_pk"
  PRIMARY KEY ("address");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sudoswap_pools";`);
  }
}
