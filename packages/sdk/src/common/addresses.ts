import { AddressZero } from "@ethersproject/constants";

import { ChainIdToAddress, ChainIdToAddressList, Network } from "../utils";

// Native currency
export const Native: ChainIdToAddress = {
  [Network.Ethereum]: AddressZero,
  [Network.EthereumGoerli]: AddressZero,
  [Network.EthereumSepolia]: AddressZero,
  [Network.Bsc]: AddressZero,
  [Network.Optimism]: AddressZero,
  [Network.Polygon]: AddressZero,
  [Network.Arbitrum]: AddressZero,
  [Network.ArbitrumNova]: AddressZero,
  [Network.Avalanche]: AddressZero,
  [Network.Mumbai]: AddressZero,
  [Network.ScrollAlpha]: AddressZero,
  [Network.MantleTestnet]: AddressZero,
  [Network.LineaTestnet]: AddressZero,
  [Network.ZoraTestnet]: AddressZero,
  [Network.Zora]: AddressZero,
  [Network.Base]: AddressZero,
  [Network.BaseGoerli]: AddressZero,
  [Network.Linea]: AddressZero,
  [Network.Zksync]: AddressZero,
  [Network.PolygonZkevm]: AddressZero,
  [Network.Ancient8Testnet]: AddressZero,
  [Network.Scroll]: AddressZero,
  [Network.ImmutableZkevmTestnet]: AddressZero,
  [Network.Beam]: AddressZero,
  [Network.BeamTestnet]: AddressZero,
};

// Wrapped native currency
export const WNative: ChainIdToAddress = {
  [Network.Ethereum]: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  [Network.EthereumGoerli]: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
  [Network.EthereumSepolia]: "0x7b79995e5f793a07bc00c21412e50ecae098e7f9",
  [Network.Bsc]: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
  [Network.Optimism]: "0x4200000000000000000000000000000000000006",
  [Network.Polygon]: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  [Network.Arbitrum]: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  [Network.ArbitrumNova]: "0x722e8bdd2ce80a4422e880164f2079488e115365",
  [Network.Avalanche]: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  [Network.Mumbai]: "0x9c3c9283d3e44854697cd22d3faa240cfb032889",
  [Network.Zora]: "0x4200000000000000000000000000000000000006",
  [Network.ZoraTestnet]: "0x4200000000000000000000000000000000000006",
  [Network.Base]: "0x4200000000000000000000000000000000000006",
  [Network.BaseGoerli]: "0x4200000000000000000000000000000000000006",
  [Network.Linea]: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f",
  [Network.LineaTestnet]: "0x2c1b868d6596a18e32e61b901e4060c872647b6c",
  [Network.ScrollAlpha]: "0x7160570bb153edd0ea1775ec2b2ac9b65f1ab61b",
  [Network.MantleTestnet]: "0xbaafec4b6ef4f5e0bafa850cbc48364b953efcf9",
  [Network.Zksync]: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
  [Network.PolygonZkevm]: "0x4f9a0e7fd2bf6067db6994cf12e4495df938e6e9",
  [Network.Ancient8Testnet]: "0x4200000000000000000000000000000000000006",
  [Network.Scroll]: "0x5300000000000000000000000000000000000004",
  [Network.ImmutableZkevmTestnet]: "0xaf7cf5d4af0bfaa85d384d42b8d410762ccbce69",
  [Network.Beam]: "0xd51bfa777609213a653a2cd067c9a0132a2d316a",
  [Network.BeamTestnet]: "0xf65b6f9c94187276c7d91f4f74134751d248bfea"
};

export const Usdc: ChainIdToAddressList = {
  [Network.Ethereum]: [
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // Native
  ],
  [Network.EthereumGoerli]: [
    "0x07865c6e87b9f70255377e024ace6630c1eaa37f", // Native
    "0x2f3a40a3db8a7e3d09b0adfefbce4f6f81927557", // Opensea
  ],
  [Network.EthereumSepolia]: [
    "0x8267cf9254734c6eb452a7bb9aaf97b392258b21", // Native
    "0x7fc21ceb0c5003576ab5e101eb240c2b822c95d2",
  ],
  [Network.Optimism]: [
    "0x7f5c764cbc14f9669b88837ca1490cca17c31607", // Bridged
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // Native
  ],
  [Network.Bsc]: [
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // Native
  ],
  [Network.Polygon]: [
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // Bridged
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // Native
  ],
  [Network.Mumbai]: [
    "0x0fa8781a83e46826621b3bc094ea2a0212e71b23", // Bridged
    "0x9999f7fea5938fd3b1e26a12c3f2fb024e194f97", // Native
  ],
  [Network.Arbitrum]: [
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // Bridged
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // Native
  ],
  [Network.Avalanche]: [
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // Native
  ],
  [Network.Zksync]: [
    "0x3355df6d4c9c3035724fd0e3914de96a5a83aaf4", // Bridged
  ],
  [Network.Base]: [
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // Bridged
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Native
  ],
};

export const Dai: ChainIdToAddress = {
  [Network.Ethereum]: "0x6b175474e89094c44da98b954eedeac495271d0f",
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
  [Network.Zora]: "0x8755310f937528173e7c5a106131d79a3601c9d9",
  [Network.Base]: "0x8755310f937528173e7c5a106131d79a3601c9d9",
  [Network.Linea]: "0x8755310f937528173e7c5a106131d79a3601c9d9",
  [Network.Avalanche]: "0x60b433ee91680189deb2c94b0b062ea283f6b4dd",
  [Network.PolygonZkevm]: "0x60b433ee91680189deb2c94b0b062ea283f6b4dd",
  [Network.Ancient8Testnet]: "0x8755310f937528173e7c5a106131d79a3601c9d9",
  [Network.Scroll]: "0xc055b6d9fd8146bc76fcd6f944c8669d5279ed95",
};

// Uniswap's `SwapRouter02`
export const SwapRouter: ChainIdToAddress = {
  [Network.Ethereum]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.EthereumGoerli]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Optimism]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Polygon]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Arbitrum]: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  [Network.Bsc]: "0xb971ef87ede563556b2ed4b1c0b0019111dd85d2",
  [Network.Base]: "0x2626664c2603336e57b271c5c0b26f421741e481",
};

// 1inch's `AggregationRouter`
export const AggregationRouterV5: ChainIdToAddress = {
  [Network.Ethereum]: "0x1111111254eeb25477b68fb85ed929f73a960582",
  [Network.EthereumGoerli]: "0x1111111254eeb25477b68fb85ed929f73a960582",
  [Network.Optimism]: "0x1111111254eeb25477b68fb85ed929f73a960582",
  [Network.Polygon]: "0x1111111254eeb25477b68fb85ed929f73a960582",
  [Network.Arbitrum]: "0x1111111254eeb25477b68fb85ed929f73a960582",
  [Network.Bsc]: "0x1111111254eeb25477b68fb85ed929f73a960582",
  [Network.Avalanche]: "0x1111111254eeb25477b68fb85ed929f73a960582",
};

export const Create3Factory: ChainIdToAddress = {
  [Network.EthereumSepolia]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.ZoraTestnet]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.BaseGoerli]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.Zora]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.Base]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.Linea]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.PolygonZkevm]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.Ancient8Testnet]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.Scroll]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.Beam]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
  [Network.BeamTestnet]: "0x0000000000000a9efe52e741bcb25da0e4438e71",
};

export const GelatoRelay1BalanceERC2771: ChainIdToAddress = {
  [Network.Ethereum]: "0xd8253782c45a12053594b9deb72d8e8ab2fca54c",
  [Network.EthereumGoerli]: "0xd8253782c45a12053594b9deb72d8e8ab2fca54c",
  [Network.EthereumSepolia]: "0xd8253782c45a12053594b9deb72d8e8ab2fca54c",
  [Network.Polygon]: "0xd8253782c45a12053594b9deb72d8e8ab2fca54c",
  [Network.Mumbai]: "0xd8253782c45a12053594b9deb72d8e8ab2fca54c",
};

export const OpenseaTransferHelper: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.EthereumGoerli]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.EthereumSepolia]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.Polygon]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.Mumbai]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.Optimism]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.Arbitrum]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.ArbitrumNova]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.Bsc]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.Avalanche]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.Base]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
  [Network.BaseGoerli]: "0x0000000000c2d145a2526bd8c716263bfebe1a72",
};
