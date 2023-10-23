import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsImprovements1687443317656 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collection_mints" ALTER COLUMN "price" DROP NOT NULL;

CREATE INDEX "allowlists_items_allowlist_id_address_index"
  ON "allowlists_items" ("allowlist_id", "address");

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
