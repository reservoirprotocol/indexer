import { MigrationInterface, QueryRunner } from "typeorm";
export class ApiKeys1662748267056 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "api_keys" ADD COLUMN "tier" INT NOT NULL DEFAULT 0;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
