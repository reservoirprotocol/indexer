import { MigrationInterface, QueryRunner } from "typeorm";
export class AddErc721LikeContractKind1670834633046 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
ALTER TYPE "contract_kind_t" RENAME VALUE 'cryptokitties' TO 'erc721-like'

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
