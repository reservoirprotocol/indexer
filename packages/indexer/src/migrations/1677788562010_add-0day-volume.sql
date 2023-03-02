-- Up Migration
alter table collections
    add day0_volume_change double precision;

alter table collections
    add day0_floor_sell_value numeric(78) default NULL::numeric;

alter table collections
    add day0_rank int;

alter table collections
    add day0_volume numeric(78) default 0;

-- Down Migration

alter table daily_volumes
drop column day0_volume_change;

alter table daily_volumes
drop column day0_floor_sell_value;

alter table daily_volumes
drop column day0_rank;

alter table daily_volumes
drop column day0_volume;


