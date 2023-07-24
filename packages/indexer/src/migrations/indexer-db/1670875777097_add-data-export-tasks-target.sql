-- Up Migration

ALTER TABLE "data_export_tasks" ADD COLUMN "name" TEXT;
ALTER TABLE "data_export_tasks" ADD COLUMN "target_table_name" TEXT;
ALTER TABLE "data_export_tasks" ADD COLUMN "is_active" BOOLEAN;

-- Down Migration

ALTER TABLE "data_export_tasks" DROP COLUMN "name";
ALTER TABLE "data_export_tasks" DROP COLUMN "target_table_name";
ALTER TABLE "data_export_tasks" DROP COLUMN "is_active";
