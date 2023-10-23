import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionMintsImprovements1687452638781 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "allowlists_items" ADD COLUMN "actual_price" NUMERIC(78, 0);

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
