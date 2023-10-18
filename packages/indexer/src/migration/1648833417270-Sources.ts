import { MigrationInterface, QueryRunner } from "typeorm";
export class Sources1648833417270 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "sources_v2" (
  "id" SERIAL PRIMARY KEY,
  "domain" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "metadata" JSONB NOT NULL
);

CREATE UNIQUE INDEX "sources_domain_unique_index"
  ON "sources_v2" ("domain");

CREATE UNIQUE INDEX "sources_name_unique_index"
  ON "sources_v2" ("name");

CREATE UNIQUE INDEX "sources_address_unique_index"
  ON "sources_v2" ("address");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sources_v2";`);
  }
}
