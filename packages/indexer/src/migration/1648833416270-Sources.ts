import { MigrationInterface, QueryRunner } from "typeorm";
export class Sources1648833416270 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "sources" (
  "source_id" TEXT NOT NULL,
  "metadata" JSONB NOT NULL
);

ALTER TABLE "sources"
  ADD CONSTRAINT "sources_pk"
  PRIMARY KEY ("source_id");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sources";`);
  }
}
