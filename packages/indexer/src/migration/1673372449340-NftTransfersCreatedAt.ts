import { MigrationInterface, QueryRunner } from "typeorm";
export class NftTransfersCreatedAt1673372449340 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "nft_transfer_events" ADD COLUMN "created_at" TIMESTAMPTZ;
ALTER TABLE "nft_transfer_events" ALTER "created_at" SET DEFAULT now();

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "nft_transfer_events" DROP COLUMN "created_at";`);
  }
}
