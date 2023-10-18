import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMints1684431232190 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TYPE "collection_mint_kind_t" AS ENUM (
  'public'
);

CREATE TYPE "collection_mint_status_t" AS ENUM (
  'open',
  'closed'
);

CREATE TABLE "collection_mints" (
  "collection_id" TEXT NOT NULL,
  "kind" "collection_mint_kind_t",
  "status" "collection_mint_status_t",
  "details" JSONB,
  "currency" BYTEA NOT NULL,
  "price" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "collection_mints"
  ADD CONSTRAINT "collection_mints_pk"
  PRIMARY KEY ("collection_id");

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
