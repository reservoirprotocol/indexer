import { MigrationInterface, QueryRunner } from "typeorm";
export class SourcesCreatedAt1673372449341 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "sources_v2" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sources_v2" DROP COLUMN "created_at";`);
  }
}
