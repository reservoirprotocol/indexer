import { MigrationInterface, QueryRunner } from "typeorm";
export class CollectionsRoyaltiesFeeBps1669655080476 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" DROP COLUMN "new_royalties_fee_bps";
ALTER TABLE "collections" ADD COLUMN "royalties_bps" INT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "royalties_bps";`);
  }
}
