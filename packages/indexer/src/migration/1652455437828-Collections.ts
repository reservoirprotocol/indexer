import { MigrationInterface, QueryRunner } from "typeorm";
export class Collections1652455437828 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "collections_sets" (
  "id" BIGSERIAL NOT NULL,
  "collections_hash" TEXT
);

ALTER TABLE "collections_sets"
  ADD CONSTRAINT "collections_sets_pk"
  PRIMARY KEY ("id");

CREATE UNIQUE INDEX "collections_sets_collections_hash_unique_index"
  ON "collections_sets" ("collections_hash");

CREATE TABLE "collections_sets_collections" (
  "collections_set_id" TEXT NOT NULL,
  "collection_id" TEXT NOT NULL
);

ALTER TABLE "collections_sets_collections"
  ADD CONSTRAINT "collections_sets_collections_pk"
  PRIMARY KEY ("collections_set_id", "collection_id");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "collections_sets_collections";

DROP TABLE "collections_sets";`
    );
  }
}
