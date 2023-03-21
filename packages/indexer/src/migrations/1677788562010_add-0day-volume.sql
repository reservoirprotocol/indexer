-- Up Migration
alter table collections
    ADD COLUMN day0_volume_change double precision;

alter table collections
    ADD COLUMN day0_floor_sell_value numeric(78) default NULL::numeric;

alter table collections
    ADD COLUMN day0_rank int;

alter table collections
    ADD COLUMN day0_volume numeric(78) default 0;

-- CREATE INDEX "collections_day0_volume_index"
--     ON "collections" ("day0_volume" DESC);

-- Down Migration

alter table daily_volumes
drop column day0_volume_change;

alter table daily_volumes
drop column day0_floor_sell_value;

alter table daily_volumes
drop column day0_rank;

alter table daily_volumes
drop column day0_volume;


