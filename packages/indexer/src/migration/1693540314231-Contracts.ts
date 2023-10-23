import { MigrationInterface, QueryRunner } from "typeorm";
export class Contracts1693540314231 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "contracts" ADD COLUMN "symbol" TEXT;
ALTER TABLE "contracts" ADD COLUMN "name" TEXT;
ALTER TABLE "contracts" ADD COLUMN "deployed_at" TIMESTAMPTZ;
ALTER TABLE "contracts" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contracts" DROP COLUMN "symbol";
ALTER TABLE "contracts" DROP COLUMN "name";
ALTER TABLE "contracts" DROP COLUMN "created_at";
ALTER TABLE "contracts" DROP COLUMN "deployed_at";`
    );
  }
}
