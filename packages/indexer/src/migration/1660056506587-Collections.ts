import { MigrationInterface, QueryRunner } from "typeorm";
export class Collections1660056506587 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" ADD COLUMN "non_flagged_token_set_id" TEXT;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
