import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMints1688575181952 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER INDEX "collection_mints_pk" RENAME TO "collection_mints_unique_index";
ALTER TABLE "collection_mints" ADD CONSTRAINT "collection_mints_pk" PRIMARY KEY ("collection_id", "stage");

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
