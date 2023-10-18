import { MigrationInterface, QueryRunner } from "typeorm";
export class Tokens1689773461587 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "tokens" DROP COLUMN "metadata_indexed";

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
