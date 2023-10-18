import { MigrationInterface, QueryRunner } from "typeorm";
export class FtApprovals1654533259333 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "ft_approvals" (
  "token" BYTEA NOT NULL,
  "owner" BYTEA NOT NULL,
  "spender" BYTEA NOT NULL,
  "value" NUMERIC NOT NULL
);

ALTER TABLE "ft_approvals"
  ADD CONSTRAINT "ft_approvals_pk"
  PRIMARY KEY ("token", "owner", "spender");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ft_approvals";`);
  }
}
