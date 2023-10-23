import { MigrationInterface, QueryRunner } from "typeorm";
export class MidaswapPools1687936565391 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "midaswap_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL, 
  "token" BYTEA NOT NULL,
  "free_rate_bps" NUMERIC(78, 0) NOT NULL,
  "royalty_bps" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "midaswap_pools"
  ADD CONSTRAINT "midaswap_pools_pk"
  PRIMARY KEY ("address");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "midaswap_pools";`);
  }
}
