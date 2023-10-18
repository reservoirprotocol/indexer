import { MigrationInterface, QueryRunner } from "typeorm";
export class Drop1695661231254 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
DROP TABLE IF EXISTS flagged_addresses;

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
