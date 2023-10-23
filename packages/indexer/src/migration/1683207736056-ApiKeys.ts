import { MigrationInterface, QueryRunner } from "typeorm";
export class ApiKeys1683207736056 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "api_keys" ADD COLUMN "ips" JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE "api_keys" ADD COLUMN "origins" JSONB NOT NULL DEFAULT '[]'::JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP COLUMN "ips";
ALTER TABLE "api_keys" DROP COLUMN "origins";`
    );
  }
}
