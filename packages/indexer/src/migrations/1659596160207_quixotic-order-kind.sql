-- Up Migration

ALTER TYPE "order_kind_t" ADD VALUE 'quixotic';
ALTER TYPE "order_kind_t" ADD VALUE 'nouns';

-- Down Migration