import { AddressZero } from "@ethersproject/constants";

import { ChainIdToAddress, Network } from "../utils";

export const Eth: ChainIdToAddress = {
  [Network.Ethereum]: AddressZero,
  [Network.EthereumGoerli]: AddressZero,
  [Network.Optimism]: AddressZero,
  [Network.Gnosis]: AddressZero,
  [Network.Polygon]: AddressZero,
  [Network.Arbitrum]: AddressZero,
  [Network.AvalancheFuji]: AddressZero,
  [Network.Avalanche]: AddressZero,
  [Network.PolygonMumbai]: AddressZero,
};

export const Weth: ChainIdToAddress = {
  [Network.Ethereum]: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  [Network.EthereumGoerli]: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
  [Network.Optimism]: "0x4200000000000000000000000000000000000006",
  [Network.Gnosis]: "0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1",
  [Network.Arbitrum]: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  // Polygon: Wrapped MATIC
  [Network.Polygon]: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  [Network.PolygonMumbai]: "0x9c3c9283d3e44854697cd22d3faa240cfb032889",
  // Avalanche: Wrapped AVAX
  [Network.Avalanche]: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  [Network.AvalancheFuji]: "0x1d308089a2d1ced3f1ce36b1fcaf815b07217be3",
};

// TODO: Include addresses across all supported chains
export const Usdc: ChainIdToAddress = {
  [Network.Ethereum]: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  [Network.Optimism]: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
};

export const RoyaltyRegistry: ChainIdToAddress = {
  [Network.Ethereum]: "0xad2184fb5dbcfc05d8f056542fb25b04fa32a95d",
  [Network.EthereumGoerli]: "0x644611f32769aaecceadec6462c9495b23b40520",
  [Network.Polygon]: "0xe7c9cb6d966f76f3b5142167088927bf34966a1f",
};

export const RoyaltyEngine: ChainIdToAddress = {
  [Network.Ethereum]: "0x0385603ab55642cb4dd5de3ae9e306809991804f",
  [Network.EthereumGoerli]: "0xe7c9cb6d966f76f3b5142167088927bf34966a1f",
  [Network.Polygon]: "0x28edfcf0be7e86b07493466e7631a213bde8eef2",
};

export const Permit2: ChainIdToAddress = {
  [Network.Ethereum]: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  [Network.Optimism]: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  [Network.Arbitrum]: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  [Network.Polygon]: "0x000000000022d473030f116ddee9f6b43ac78ba3"
};