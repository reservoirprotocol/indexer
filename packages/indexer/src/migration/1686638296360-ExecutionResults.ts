import { MigrationInterface, QueryRunner } from "typeorm";
export class ExecutionResults1686638296360 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "execution_results" (
  "id" BIGSERIAL NOT NULL,
  "request_id" UUID NOT NULL,
  "step_id" TEXT NOT NULL,
  "api_key" TEXT,
  "tx_hash" BYTEA,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "execution_results"
  ADD CONSTRAINT "execution_results_pk"
  PRIMARY KEY ("id");

ALTER TABLE "executions"
  ADD COLUMN "from" BYTEA,
  ADD COLUMN "to" BYTEA,
  ADD COLUMN "value" NUMERIC(78, 0);

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "execution_results";`);
  }
}
