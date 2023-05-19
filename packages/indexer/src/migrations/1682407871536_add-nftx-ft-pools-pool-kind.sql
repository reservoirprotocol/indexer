-- Up Migration

CREATE TYPE "nftx_ft_pool_kind_t" AS ENUM (
  'sushiswap',
  'uniswap-v3'
);
ALTER TABLE "nftx_ft_pools" ADD COLUMN "pool_kind" "nftx_ft_pool_kind_t" DEFAULT 'sushiswap';

-- Down Migration

ALTER TABLE "nftx_ft_pools" DROP COLUMN "pool_kind";
DROP TYPE "nftx_ft_pool_kind_t";