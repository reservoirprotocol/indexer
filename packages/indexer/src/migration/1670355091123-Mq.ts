import { MigrationInterface, QueryRunner } from "typeorm";
export class Mq1670355091123 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "mq_jobs_data" (
  id uuid DEFAULT uuid_generate_v4 (),
  queue_name TEXT,
  "data" JSONB NOT NULL,
  PRIMARY KEY (id)
);

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mq_jobs_data";`);
  }
}
