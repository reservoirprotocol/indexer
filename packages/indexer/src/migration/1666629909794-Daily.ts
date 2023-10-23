import { MigrationInterface, QueryRunner } from "typeorm";
export class Daily1666629909794 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "daily_volumes" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "daily_volumes" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_volumes" DROP COLUMN "created_at";
ALTER TABLE "daily_volumes" DROP COLUMN "updated_at";`
    );
  }
}
