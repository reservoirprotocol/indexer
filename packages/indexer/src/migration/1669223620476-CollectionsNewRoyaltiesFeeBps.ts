import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionsNewRoyaltiesFeeBps1669223620476 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" ADD COLUMN "new_royalties_fee_bps" JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "new_royalties_fee_bps";`);
  }
}
