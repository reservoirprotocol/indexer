import { MigrationInterface, QueryRunner } from "typeorm";
export class RateLimits1676664167056 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "rate_limit_rules" ADD COLUMN "payload" JSONB NOT NULL DEFAULT '[]'::JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rate_limit_rules" DROP COLUMN "payload";`);
  }
}
