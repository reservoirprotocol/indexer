import { MigrationInterface, QueryRunner } from "typeorm";
export class SourcesOptimized1665073589748 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "sources_v2" ADD COLUMN "optimized" BOOLEAN NOT NULL DEFAULT FALSE;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sources_v2" DROP COLUMN "optimized";`);
  }
}
