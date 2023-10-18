import { MigrationInterface, QueryRunner } from "typeorm";
export class Orders1687372721129 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "orders" DROP COLUMN "source_id";
ALTER TABLE "orders" DROP COLUMN "bundle_kind";
ALTER TABLE "orders" DROP COLUMN "offer_bundle_id";
ALTER TABLE "orders" DROP COLUMN "consideration_bundle_id";

DROP TYPE "order_bundle_kind_t";

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
