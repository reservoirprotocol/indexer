import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x9757f2d2b135150bbeb65308d4a91804107cd8d6",
  [Network.EthereumGoerli]: "0x02afbd43cad367fcb71305a2dfb9a3928218f0c1",
};

export const NFTTransferProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0x4fee7b061c97c9c496b01dbce9cdb10c02f0a0be",
  [Network.EthereumGoerli]: "0x21b0b84ffab5a8c48291f5ec9d9fdb9aef574052",
};

export const ERC721LazyTransferProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0xbb7829bfdd4b557eb944349b2e2c965446052497",
  [Network.EthereumGoerli]: "0x96102d9472c0338005cbf12fb7ea829f242c2809",
};

export const ERC1155LazyTransferProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0x75a8b7c0b22d973e0b46cfbd3e2f6566905aa79f",
  [Network.EthereumGoerli]: "0x1e1b6e13f0eb4c570628589e3c088bc92ad4db45",
};

export const ERC20TransferProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0xb8e4526e0da700e9ef1f879af713d691f81507d8",
  [Network.EthereumGoerli]: "0x17cef9a8bf107d58e87c170be1652c06390bd990",
};

export const ExchangeV1: ChainIdToAddress = {
  [Network.Ethereum]: "0xcd4ec7b66fbc029c116ba9ffb3e59351c20b5b06",
};
