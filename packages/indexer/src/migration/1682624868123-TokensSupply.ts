import { MigrationInterface, QueryRunner } from "typeorm";
export class TokensSupply1682624868123 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "tokens" ADD COLUMN "supply" NUMERIC(78, 0);
ALTER TABLE "tokens" ADD COLUMN "remaining_supply" NUMERIC(78, 0);


`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
