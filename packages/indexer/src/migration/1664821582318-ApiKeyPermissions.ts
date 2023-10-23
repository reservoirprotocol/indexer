import { MigrationInterface, QueryRunner } from "typeorm";
export class ApiKeyPermissions1664821582318 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "api_keys" ADD COLUMN "permissions" JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "permissions";`);
  }
}
