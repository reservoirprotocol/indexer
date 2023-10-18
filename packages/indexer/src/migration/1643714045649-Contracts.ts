import { MigrationInterface, QueryRunner } from "typeorm";
export class Contracts1643714045649 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TYPE "contract_kind_t" AS ENUM (
  'erc721',
  'erc1155'
);

CREATE TABLE "contracts" (
  "address" BYTEA NOT NULL,
  "kind" "contract_kind_t" NOT NULL
);

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_pk"
  PRIMARY KEY ("address");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "contracts";

DROP TYPE "contract_kind_t";`
    );
  }
}
