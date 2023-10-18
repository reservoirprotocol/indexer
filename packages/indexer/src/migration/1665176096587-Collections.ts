import { MigrationInterface, QueryRunner } from "typeorm";
export class Collections1665176096587 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE collections ALTER COLUMN token_id_range DROP NOT NULL;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
