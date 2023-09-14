-- Up Migration

CREATE TABLE "nftx_nft_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL,
  "vault_id" INTEGER NOT NULL
);

ALTER TABLE "nftx_nft_pools"
  ADD CONSTRAINT "nftx_nft_pools_pk"
  PRIMARY KEY ("address");

CREATE TABLE "nftx_ft_pools" (
  "address" BYTEA NOT NULL,
  "token0" BYTEA NOT NULL,
  "token1" BYTEA NOT NULL
);

ALTER TABLE "nftx_ft_pools"
  ADD CONSTRAINT "nftx_ft_pools_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "nftx_ft_pools";

DROP TABLE "nftx_nft_pools";