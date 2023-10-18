import { MigrationInterface, QueryRunner } from "typeorm";
export class Tokens1669990797123 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "tokens" ADD COLUMN "last_flag_change" TIMESTAMPTZ;

CREATE INDEX "tokens_last_flag_change_is_flagged_index"
  ON "tokens" ("last_flag_change" DESC NULLS LAST, "is_flagged");

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
