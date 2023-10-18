import { MigrationInterface, QueryRunner } from "typeorm";
export class TransactionTraces1662382253823 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "transaction_traces" (
  "hash" BYTEA NOT NULL,
  "calls" JSONB NOT NULL
);


ALTER TABLE "transaction_traces"
  ADD CONSTRAINT "transaction_traces_pk"
  PRIMARY KEY ("hash");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transaction_traces";`);
  }
}
