import { AddressZero } from "@ethersproject/constants";

import { ChainIdToAddress, Network } from "../utils";

export const Eth: ChainIdToAddress = {
  [Network.Ethereum]: AddressZero,
  [Network.EthereumGoerli]: AddressZero,
  [Network.EthereumSepolia]: AddressZero,
  [Network.Bsc]: AddressZero,
  [Network.Optimism]: AddressZero,
  [Network.Gnosis]: AddressZero,
  [Network.Polygon]: AddressZero,
  [Network.Arbitrum]: AddressZero,
  [Network.Avalanche]: AddressZero,
  [Network.ScrollAlpha]: AddressZero,
  [Network.MantleTestnet]: AddressZero,
  [Network.LineaTestnet]: AddressZero,
  [Network.ZoraTestnet]: AddressZero,
  [Network.Mumbai]: AddressZero,
  [Network.ArbitrumNova]: AddressZero,
  [Network.BaseGoerli]: AddressZero,
};

export const Weth: ChainIdToAddress = {
  [Network.Ethereum]: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  [Network.EthereumGoerli]: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
  [Network.EthereumSepolia]: "0x7b79995e5f793a07bc00c21412e50ecae098e7f9",
  // Bsc: Wrapped BNB
  [Network.Bsc]: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
  [Network.Optimism]: "0x4200000000000000000000000000000000000006",
  [Network.Gnosis]: "0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1",
  [Network.Arbitrum]: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  [Network.ArbitrumNova]: "0x722e8bdd2ce80a4422e880164f2079488e115365",
  // Polygon: Wrapped MATIC
  [Network.Polygon]: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  [Network.Mumbai]: "0x9c3c9283d3e44854697cd22d3faa240cfb032889",
  // Avalanche: Wrapped AVAX
  [Network.Avalanche]: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  [Network.ScrollAlpha]: "0x7160570bb153edd0ea1775ec2b2ac9b65f1ab61b",
  [Network.MantleTestnet]: "0xbaafec4b6ef4f5e0bafa850cbc48364b953efcf9",
  [Network.LineaTestnet]: "0x2c1b868d6596a18e32e61b901e4060c872647b6c",
  [Network.ZoraTestnet]: "0x4200000000000000000000000000000000000006",
  [Network.BaseGoerli]: "0x4200000000000000000000000000000000000006",
};

// TODO: Include addresses across all supported chains
export const Usdc: ChainIdToAddress = {
  [Network.Ethereum]: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  [Network.EthereumGoerli]: "0x07865c6e87b9f70255377e024ace6630c1eaa37f",
  [Network.Optimism]: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
  [Network.Bsc]: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  [Network.Polygon]: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
  [Network.Arbitrum]: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
};

export const RoyaltyEngine: ChainIdToAddress = {
  [Network.Ethereum]: "0x0385603ab55642cb4dd5de3ae9e306809991804f",
  [Network.EthereumGoerli]: "0xe7c9cb6d966f76f3b5142167088927bf34966a1f",
  [Network.EthereumSepolia]: "0x8755310f937528173e7c5a106131d79a3601c9d9",
  [Network.Bsc]: "0xef770dfb6d5620977213f55f99bfd781d04bbe15",
  [Network.Optimism]: "0xef770dfb6d5620977213f55f99bfd781d04bbe15",
  [Network.Polygon]: "0x28edfcf0be7e86b07493466e7631a213bde8eef2",
  [Network.Arbitrum]: "0xef770dfb6d5620977213f55f99bfd781d04bbe15",
  [Network.ZoraTestnet]: "0x8755310f937528173e7c5a106131d79a3601c9d9",
  [Network.ScrollAlpha]: "0x60b433ee91680189deb2c94b0b062ea283f6b4dd",
  [Network.Mumbai]: "0x60b433ee91680189deb2c94b0b062ea283f6b4dd",
  [Network.BaseGoerli]: "0x8755310f937528173e7c5a106131d79a3601c9d9",
  [Network.ArbitrumNova]: "0x60b433ee91680189deb2c94b0b062ea283f6b4dd",
};

export const SwapRouter: ChainIdToAddress = {
  [Network.Ethereum]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.EthereumGoerli]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Optimism]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Polygon]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Arbitrum]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Bsc]: "0xb971ef87ede563556b2ed4b1c0b0019111dd85d2",
};

export const Create3Factory: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.ZoraTestnet]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.BaseGoerli]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
};
