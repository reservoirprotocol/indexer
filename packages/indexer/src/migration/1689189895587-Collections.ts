import { MigrationInterface, QueryRunner } from "typeorm";
export class Collections1689189895587 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" ADD COLUMN "creator" BYTEA;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
