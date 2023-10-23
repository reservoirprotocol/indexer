import { MigrationInterface, QueryRunner } from "typeorm";
export class Routers1673523143573 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "routers" (
  "address" BYTEA NOT NULL,
  "source_id" INT NOT NULL
);

ALTER TABLE "routers"
  ADD CONSTRAINT "routers_pk"
  PRIMARY KEY ("address");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "routers";`);
  }
}
