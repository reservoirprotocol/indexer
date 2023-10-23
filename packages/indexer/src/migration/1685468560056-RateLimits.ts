import { MigrationInterface, QueryRunner } from "typeorm";
export class RateLimits1685468560056 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE "rate_limit_rules" ADD COLUMN "correlation_id" uuid DEFAULT uuid_generate_v4 ();

CREATE UNIQUE INDEX "rate_limit_rules_correlation_id_unique_index"
  ON "rate_limit_rules" ("correlation_id");

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
