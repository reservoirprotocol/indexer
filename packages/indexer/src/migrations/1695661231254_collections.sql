-- Up Migration
alter table collections
    add day1_sales_count int;

-- Down Migration

alter table collections
drop column day1_sales_count;

