import { MigrationInterface, QueryRunner } from "typeorm";
export class Blocks1654505890174 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "blocks" (
  "hash" BYTEA NOT NULL,
  "number" INT NOT NULL
);

ALTER TABLE "blocks"
  ADD CONSTRAINT "blocks_pk"
  PRIMARY KEY ("number", "hash");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "blocks";`);
  }
}
