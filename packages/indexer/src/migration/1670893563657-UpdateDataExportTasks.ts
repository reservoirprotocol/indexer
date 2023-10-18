import { MigrationInterface, QueryRunner } from "typeorm";
export class UpdateDataExportTasks1670893563657 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "data_export_tasks" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "data_export_tasks" ALTER COLUMN "target_table_name" SET NOT NULL;
ALTER TABLE "data_export_tasks" ALTER COLUMN "is_active" SET NOT NULL;
ALTER TABLE "data_export_tasks" ALTER COLUMN "is_active" SET DEFAULT FALSE;

DROP INDEX "data_export_tasks_source_unique_index";

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "data_export_tasks" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "data_export_tasks" ALTER COLUMN "target_table_name" DROP NOT NULL;
ALTER TABLE "data_export_tasks" ALTER COLUMN "is_active" DROP NOT NULL;
ALTER TABLE "data_export_tasks" ALTER COLUMN "is_active" DROP DEFAULT;

CREATE UNIQUE INDEX "data_export_tasks_source_unique_index"
  ON "data_export_tasks" ("source");`
    );
  }
}
