import { MigrationInterface, QueryRunner } from "typeorm";
export class CancelEventsCreatedAt1682373331544 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "cancel_events" ADD COLUMN "created_at" TIMESTAMPTZ;
ALTER TABLE "cancel_events" ALTER "created_at" SET DEFAULT now();

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cancel_events" DROP COLUMN "created_at";`);
  }
}
