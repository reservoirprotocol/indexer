import { MigrationInterface, QueryRunner } from "typeorm";
export class MethodSignatures1684399749881 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "method_signatures" (
  "signature" BYTEA NOT NULL,
  "name" TEXT NOT NULL,
  "params" TEXT NOT NULL
);

ALTER TABLE "method_signatures"
  ADD CONSTRAINT "method_signatures_pk"
  PRIMARY KEY ("signature", "params");

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
