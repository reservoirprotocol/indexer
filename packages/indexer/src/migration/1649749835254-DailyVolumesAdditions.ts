import { MigrationInterface, QueryRunner } from "typeorm";
export class DailyVolumesAdditions1649749835254 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
alter table daily_volumes
add floor_sell_value numeric(78);

alter table daily_volumes
add sales_count int;

alter table collections
    add day1_volume_change double precision;

alter table collections
    add day7_volume_change double precision;

alter table collections
    add day30_volume_change double precision;

alter table collections
    add day1_floor_sell_value numeric(78) default NULL::numeric;

alter table collections
    add day7_floor_sell_value numeric(78) default NULL::numeric;

alter table collections
    add day30_floor_sell_value numeric(78) default NULL::numeric;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table daily_volumes
drop column floor_sell_value;

alter table daily_volumes
drop column sales_count;

alter table collections
drop column day1_volume_change;

alter table collections
drop column day7_volume_change;

alter table collections
drop column day30_volume_change;

alter table collections
drop column day1_floor_sell_value;

alter table collections
drop column day7_floor_sell_value;

alter table collections
drop column day30_floor_sell_value;`
    );
  }
}
