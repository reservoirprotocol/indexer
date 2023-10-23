import { MigrationInterface, QueryRunner } from "typeorm";
export class TokensTimeToMetadata1693595278218 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "tokens" ADD COLUMN "metadata_indexed_at" TIMESTAMPTZ;
ALTER TABLE "tokens" ADD COLUMN "metadata_initialized_at" TIMESTAMPTZ;
ALTER TABLE "tokens" ADD COLUMN "metadata_changed_at" TIMESTAMPTZ;
ALTER TABLE "tokens" ADD COLUMN "metadata_updated_at" TIMESTAMPTZ;


`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tokens" DROP COLUMN "metadata_indexed_at";
ALTER TABLE "tokens" DROP COLUMN "metadata_initialized_at";
ALTER TABLE "tokens" DROP COLUMN "metadata_changed_at";
ALTER TABLE "tokens" DROP COLUMN "metadata_updated_at";`
    );
  }
}
