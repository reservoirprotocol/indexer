import { ChainIdToAddress, Network } from "../../utils";

// Router

// V6_0_1
export const Router: ChainIdToAddress = {
  [Network.Ethereum]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.EthereumGoerli]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.Polygon]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.Optimism]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.Arbitrum]: "0xc2c862322e9c97d6244a3506655da95f05246fd8",
  [Network.ScrollAlpha]: "0xd17f3e7ab95ca115a7e89610cde1f0b01248fe9a",
};

// Approval proxy

export const ApprovalProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.EthereumGoerli]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Polygon]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Optimism]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.Arbitrum]: "0x79ce8f93063f8be4573a58f250b003859ebb7a24",
  [Network.ScrollAlpha]: "0xae4acac642fc0330e37c4ef20434934ee9636bc9",
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

export const SeaportV15Module: ChainIdToAddress = {};

export const AlienswapModule: ChainIdToAddress = {
  [Network.Ethereum]: "0xb56fa88072f5e299331cbb810d25075f6caa889c",
  [Network.EthereumGoerli]: "0xb56fa88072f5e299331cbb810d25075f6caa889c",
  [Network.ScrollAlpha]: "0x60275b726b9aB1FdC6c2d3d8072F234FAb5DdaeB",
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

export const RaribleModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x428a6be88fc0d25778e3c3f6e09fcfdc9a526fad",
};

export const SuperRareModule: ChainIdToAddress = {
  [Network.Ethereum]: "0x512a6a1a74f1f08aac8155605b9da8ace46b3d9c",
};
