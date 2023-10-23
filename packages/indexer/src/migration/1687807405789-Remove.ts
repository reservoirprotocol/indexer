import { MigrationInterface, QueryRunner } from "typeorm";
export class Remove1687807405789 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

DROP TABLE IF EXISTS "activities";
DROP TABLE IF EXISTS "user_activities";

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
