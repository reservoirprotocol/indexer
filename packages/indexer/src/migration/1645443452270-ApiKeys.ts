import { MigrationInterface, QueryRunner } from "typeorm";
export class ApiKeys1645443452270 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "api_keys" (
  "key" TEXT NOT NULL,
  "app_name" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_pk"
  PRIMARY KEY ("key");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_keys";`);
  }
}
