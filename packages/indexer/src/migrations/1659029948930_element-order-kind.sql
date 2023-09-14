-- Up Migration

ALTER TYPE "order_kind_t" ADD VALUE 'element-erc721';
ALTER TYPE "order_kind_t" ADD VALUE 'element-erc1155';

-- Down Migration