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
  [Network.LineaTestnet]: "0x1f330b0d2bf5ca4b380aa9b60ee089eda9963eff",
  [Network.MiscTestnet]: "0x1aed60a97192157fda7fb26267a439d523d09c5e",
};

// Approval proxy

export const ApprovalProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.EthereumGoerli]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.EthereumSepolia]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
  [Network.Polygon]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Optimism]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Arbitrum]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.ScrollAlpha]: "0xae4acac642fc0330e37c4ef20434934ee9636bc9",
  [Network.MantleTestnet]: "0xe33d3d26d5c75bffb0170d1f06a2c442e643f65e",
  [Network.LineaTestnet]: "0xbcfac90e4686ca855684e28b3752866acda79e27",
  [Network.MiscTestnet]: "0x224ecb4eae96d31372d1090c3b0233c8310dbbab",
};

// Utility modules

export const SwapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x5cf0a457d2b6c003232184178e87c91248f73477",
  [Network.Polygon]: "0x5cf0a457d2b6c003232184178e87c91248f73477",
  [Network.Optimism]: "0x5cf0a457d2b6c003232184178e87c91248f73477",
  [Network.Arbitrum]: "0x5cf0a457d2b6c003232184178e87c91248f73477",
};

// Exchange modules

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
};

export const SeaportV14Module: ChainIdToAddress = {
  [Network.Ethereum]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.EthereumGoerli]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.Polygon]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.Optimism]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
  [Network.Arbitrum]: "0x07c163b007b3db7ccffef77848a766047d8ffc2d",
};

export const SeaportV15Module: ChainIdToAddress = {
  [Network.Ethereum]: "0xf645877ab54e5856f39dc90425ae21748f52b5d4",
  [Network.EthereumGoerli]: "0xf645877ab54e5856f39dc90425ae21748f52b5d4",
  [Network.EthereumSepolia]: "0x0df8a66ba3010af4f86ca4db6a6da9e367385a03",
  [Network.Polygon]: "0xf645877ab54e5856f39dc90425ae21748f52b5d4",
  [Network.Optimism]: "0xf645877ab54e5856f39dc90425ae21748f52b5d4",
  [Network.Arbitrum]: "0xf645877ab54e5856f39dc90425ae21748f52b5d4",
  [Network.MiscTestnet]: "0x0df8a66ba3010af4f86ca4db6a6da9e367385a03",
};

export const AlienswapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xb56fa88072f5e299331cbb810d25075f6caa889c",
  [Network.EthereumGoerli]: "0xb56fa88072f5e299331cbb810d25075f6caa889c",
  [Network.ScrollAlpha]: "0x60275b726b9ab1fdc6c2d3d8072f234fab5ddaeb",
  [Network.MantleTestnet]: "0xf94d47c742c97f37424db1c27817a0697d49f461",
  [Network.LineaTestnet]: "0xeb09b04d38d809c2dd5f33dda7208d0b299eda5a",
};

export const SudoswapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xa97727370e2592f83602bc92975c49c4fea4491f",
};

export const X2Y2Module: ChainIdToAddress = {
  [Network.Ethereum]: "0x7562e6d5d901ece54a89530f1c8d63e7cfaeebff",
  [Network.EthereumGoerli]: "0x7562e6d5d901ece54a89530f1c8d63e7cfaeebff",
};

export const ZeroExV4Module: ChainIdToAddress = {
  [Network.Ethereum]: "0xb6c0cf204d7872fff613fa090f723d9d520ede2a",
  [Network.EthereumGoerli]: "0xb6c0cf204d7872fff613fa090f723d9d520ede2a",
};

export const ZoraModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xace0df31b8759c97b7b06dd5db3335fc190225e0",
};

export const ElementModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x5d92ac3936b6a02a684b214d2ecbc2e75fd9e0b4",
};

export const NFTXModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x716d13135f6a5bdb3fbc6beeb8dea35776d20da7",
};

export const NFTXZeroExModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xcd4ebd768ccbe022274506f5e45d14fd90dc5be7",
};

export const RaribleModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x428a6be88fc0d25778e3c3f6e09fcfdc9a526fad",
};

export const SuperRareModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x512a6a1a74f1f08aac8155605b9da8ace46b3d9c",
};
