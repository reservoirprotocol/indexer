import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionsMarketplaceFees1678735936581 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" ADD COLUMN "marketplace_fees" JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "marketplace_fees";`);
  }
}
