import { MigrationInterface, QueryRunner } from "typeorm";
export class TransactionLogs1662462929056 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "transaction_logs" (
  "hash" BYTEA NOT NULL,
  "logs" JSONB NOT NULL
);


ALTER TABLE "transaction_logs"
  ADD CONSTRAINT "transaction_logs_pk"
  PRIMARY KEY ("hash");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transaction_logs";`);
  }
}
