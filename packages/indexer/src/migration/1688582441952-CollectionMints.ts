import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMints1688582441952 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collection_mints" DROP CONSTRAINT "collection_mints_pk";
ALTER TABLE collection_mints ADD COLUMN "id" BIGSERIAL;
ALTER TABLE "collection_mints" ADD CONSTRAINT "collection_mints_pk" PRIMARY KEY ("id");

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
