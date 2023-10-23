import { MigrationInterface, QueryRunner } from "typeorm";
export class Tokens1666720715123 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "tokens" ADD COLUMN "minted_timestamp" INT;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
