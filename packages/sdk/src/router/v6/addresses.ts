import { ChainIdToAddress, Network } from "../../utils";

// Router

// V6_0_1
export const Router: ChainIdToAddress = {
  [Network.Ethereum]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.EthereumGoerli]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.EthereumSepolia]: "0x1aed60a97192157fda7fb26267a439d523d09c5e",
  [Network.Polygon]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.Optimism]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.Arbitrum]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.ScrollAlpha]: "0xd17f3e7ab95ca115a7e89610cde1f0b01248fe9a",
  [Network.MantleTestnet]: "0xd08d4d2046c234d32f4abf889e9cb93bcb756dc5",
  [Network.LineaTestnet]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.ZoraTestnet]: "0x1aed60a97192157fda7fb26267a439d523d09c5e",
  [Network.Mumbai]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.BaseGoerli]: "0x1aed60a97192157fda7fb26267a439d523d09c5e",
  [Network.ArbitrumNova]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.Bsc]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.Zora]: "0x1aed60a97192157fda7fb26267a439d523d09c5e",
  [Network.Base]: "0x1aed60a97192157fda7fb26267a439d523d09c5e",
  [Network.Linea]: "0x1aed60a97192157fda7fb26267a439d523d09c5e",
  [Network.Avalanche]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.X1Testnet]: "0x9f7292ba383db44928933f52ef2acc03816594f2",
};

// Approval proxy

export const ApprovalProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.EthereumGoerli]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.EthereumSepolia]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
  [Network.Polygon]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Optimism]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Arbitrum]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.ScrollAlpha]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.MantleTestnet]: "0xe33d3d26d5c75bffb0170d1f06a2c442e643f65e",
  [Network.LineaTestnet]: "0xbcfac90e4686ca855684e28b3752866acda79e27",
  [Network.ZoraTestnet]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
  [Network.Mumbai]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.BaseGoerli]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
  [Network.ArbitrumNova]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Bsc]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Zora]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
  [Network.Base]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
  [Network.Linea]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
  [Network.Avalanche]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
};

// Permit proxy

export const PermitProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0x104ff9a0e2a62aa531ef0cc9d19f948bde7062de",
  [Network.EthereumGoerli]: "0x104ff9a0e2a62aa531ef0cc9d19f948bde7062de",
  [Network.Polygon]: "0x104ff9a0e2a62aa531ef0cc9d19f948bde7062de",
  [Network.Mumbai]: "0x104ff9a0e2a62aa531ef0cc9d19f948bde7062de",
};

// Utility modules

export const SwapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x34acff419b262f3400d6aa17bd5b99a8c81e9726",
  [Network.EthereumGoerli]: "0x34acff419b262f3400d6aa17bd5b99a8c81e9726",
  [Network.Polygon]: "0x34acff419b262f3400d6aa17bd5b99a8c81e9726",
  [Network.Optimism]: "0x34acff419b262f3400d6aa17bd5b99a8c81e9726",
  [Network.Arbitrum]: "0x34acff419b262f3400d6aa17bd5b99a8c81e9726",
  [Network.Bsc]: "0x34acff419b262f3400d6aa17bd5b99a8c81e9726",
  [Network.Base]: "0x34acff419b262f3400d6aa17bd5b99a8c81e9726",
};

export const OneInchSwapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xa34a25b433597ecab5cad6d740a25dadec252d7d",
  [Network.EthereumGoerli]: "0xa34a25b433597ecab5cad6d740a25dadec252d7d",
  [Network.Polygon]: "0xa34a25b433597ecab5cad6d740a25dadec252d7d",
  [Network.Optimism]: "0xa34a25b433597ecab5cad6d740a25dadec252d7d",
  [Network.Arbitrum]: "0xa34a25b433597ecab5cad6d740a25dadec252d7d",
  [Network.Bsc]: "0xa34a25b433597ecab5cad6d740a25dadec252d7d",
  [Network.Avalanche]: "0xa34a25b433597ecab5cad6d740a25dadec252d7d",
};

// Exchange modules

export const MintModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x0b85f4e399fc69044bd9ee604a59e9663f1ea292",
  [Network.EthereumGoerli]: "0x0b85f4e399fc69044bd9ee604a59e9663f1ea292",
  [Network.EthereumSepolia]: "0x0b85f4e399fc69044bd9ee604a59e9663f1ea292",
  [Network.Optimism]: "0x0b85f4e399fc69044bd9ee604a59e9663f1ea292",
  [Network.Bsc]: "0x0b85f4e399fc69044bd9ee604a59e9663f1ea292",
  [Network.Base]: "0x3a65a4875be880552ecd27de4084799b65b40065",
  [Network.BaseGoerli]: "0x3a65a4875be880552ecd27de4084799b65b40065",
  [Network.Zora]: "0x3a65a4875be880552ecd27de4084799b65b40065",
  [Network.ZoraTestnet]: "0x3a65a4875be880552ecd27de4084799b65b40065",
  [Network.Avalanche]: "0x0b85f4e399fc69044bd9ee604a59e9663f1ea292",
};

export const CollectionXyzModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x22097b493ea4c202d5b85cc9faf6d116830aa8a3",
  [Network.EthereumGoerli]: "0x22097b493ea4c202d5b85cc9faf6d116830aa8a3",
};

export const DittoModule: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0xcc97a1297c78d5860a4ceabc8fe6218601b1f42c",
};

export const FoundationModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x29155db9c01ac5412ad03c577d71bd9d0e90db97",
};

export const LooksRareModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x71f52a45b4d79977156e410314e1cb16814dbc3b",
  [Network.EthereumGoerli]: "0x71f52a45b4d79977156e410314e1cb16814dbc3b",
};

export const LooksRareV2Module: ChainIdToAddress = {
  [Network.Ethereum]: "0x9561e33b68d7c21e4010f027d751d417127cc5b5",
  [Network.EthereumGoerli]: "0x9561e33b68d7c21e4010f027d751d417127cc5b5",
};

export const SeaportModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xd8741e5e73fbc7b30863282de5595e49359910d2",
  [Network.EthereumGoerli]: "0xd8741e5e73fbc7b30863282de5595e49359910d2",
  [Network.Polygon]: "0xd8741e5e73fbc7b30863282de5595e49359910d2",
  [Network.Optimism]: "0xd8741e5e73fbc7b30863282de5595e49359910d2",
  [Network.Arbitrum]: "0xd8741e5e73fbc7b30863282de5595e49359910d2",
  [Network.Bsc]: "0xd8741e5e73fbc7b30863282de5595e49359910d2",
};

export const SeaportV14Module: ChainIdToAddress = {
  [Network.Ethereum]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.EthereumGoerli]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.Polygon]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.Optimism]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.Arbitrum]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.Bsc]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
};

export const SeaportV15Module: ChainIdToAddress = {
  [Network.Ethereum]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.EthereumGoerli]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.EthereumSepolia]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.Polygon]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.Mumbai]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.Optimism]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.Arbitrum]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.ArbitrumNova]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.Bsc]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.Zora]: "0x4e9aaa72727a2f5aa5d2bef80ab5642661e29ef6",
  [Network.ZoraTestnet]: "0x4e9aaa72727a2f5aa5d2bef80ab5642661e29ef6",
  [Network.ScrollAlpha]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
  [Network.BaseGoerli]: "0x4e9aaa72727a2f5aa5d2bef80ab5642661e29ef6",
  [Network.Base]: "0x4e9aaa72727a2f5aa5d2bef80ab5642661e29ef6",
  [Network.Linea]: "0x4e9aaa72727a2f5aa5d2bef80ab5642661e29ef6",
  [Network.Avalanche]: "0x00ca04c45da318d5b7e7b14d5381ca59f09c73f0",
};

export const AlienswapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xb56fa88072f5e299331cbb810d25075f6caa889c",
  [Network.EthereumGoerli]: "0xb56fa88072f5e299331cbb810d25075f6caa889c",
  [Network.ScrollAlpha]: "0x60275b726b9ab1fdc6c2d3d8072f234fab5ddaeb",
  [Network.MantleTestnet]: "0xf94d47c742c97f37424db1c27817a0697d49f461",
  [Network.LineaTestnet]: "0xeb09b04d38d809c2dd5f33dda7208d0b299eda5a",
  [Network.Linea]: "0xf769c98b6e384e98e36d6fc3ec7247dd1e887f57",
  [Network.BaseGoerli]: "0x527534529577b57548a1dbc0d7fb0088705a1965",
  [Network.Base]: "0x25210757f799423c908e4dbf8141dd10d51afbc6",
  [Network.EthereumSepolia]: "0x54e9b4580f8c180e8020cec7a330f189658e1329",
};

export const SudoswapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xa97727370e2592f83602bc92975c49c4fea4491f",
};

export const SudoswapV2Module: ChainIdToAddress = {
  [Network.Ethereum]: "0xe2840826c43c25e88a5ef43ff790d7105889dd6e",
  [Network.EthereumGoerli]: "0xe2840826c43c25e88a5ef43ff790d7105889dd6e",
};

export const CaviarV1Module: ChainIdToAddress = {
  [Network.Ethereum]: "0x14e29b2de5cbb86fc8bad483e6dff38d58057e80",
  [Network.EthereumGoerli]: "0x14e29b2de5cbb86fc8bad483e6dff38d58057e80",
};

export const X2Y2Module: ChainIdToAddress = {
  [Network.Ethereum]: "0x7562e6d5d901ece54a89530f1c8d63e7cfaeebff",
  [Network.EthereumGoerli]: "0x7562e6d5d901ece54a89530f1c8d63e7cfaeebff",
};

export const ZeroExV4Module: ChainIdToAddress = {
  [Network.Ethereum]: "0xb6c0cf204d7872fff613fa090f723d9d520ede2a",
  [Network.EthereumGoerli]: "0xb6c0cf204d7872fff613fa090f723d9d520ede2a",
  [Network.Bsc]: "0xb6c0cf204d7872fff613fa090f723d9d520ede2a",
};

export const ZoraModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xace0df31b8759c97b7b06dd5db3335fc190225e0",
};

export const ElementModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x5d92ac3936b6a02a684b214d2ecbc2e75fd9e0b4",
};

export const NFTXModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xfcd5b37fb64c06646c390d0376e8aad9bf5e1163",
};

export const NFTXZeroExModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xcd4ebd768ccbe022274506f5e45d14fd90dc5be7",
};

export const RaribleModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x428a6be88fc0d25778e3c3f6e09fcfdc9a526fad",
  [Network.EthereumGoerli]: "0x428a6be88fc0d25778e3c3f6e09fcfdc9a526fad",
};

export const SuperRareModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x512a6a1a74f1f08aac8155605b9da8ace46b3d9c",
};

export const MidaswapModule: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0xfe1aaded2702e7976ac6c2e7dca7708a04232396",
};

export const CryptoPunksModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x8be240e8689547f1068a835d14f1d943958095dc",
};

export const PaymentProcessorModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x929adee14d57019bfd4d092889abe3e2a647e706",
  [Network.EthereumGoerli]: "0x929adee14d57019bfd4d092889abe3e2a647e706",
  [Network.EthereumSepolia]: "0x929adee14d57019bfd4d092889abe3e2a647e706",
};
