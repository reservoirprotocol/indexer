import { MigrationInterface, QueryRunner } from "typeorm";
export class TokensMetadata1685459891870 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "tokens" ADD COLUMN "metadata" JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tokens" DROP COLUMN "metadata";`);
  }
}
