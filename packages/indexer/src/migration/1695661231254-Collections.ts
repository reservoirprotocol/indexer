import { MigrationInterface, QueryRunner } from "typeorm";
export class Collections1695661231254 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
alter table collections
    add day1_sales_count int;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table collections
drop column day1_sales_count;`
    );
  }
}
