import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x9757f2d2b135150bbeb65308d4a91804107cd8d6",
  [Network.EthereumGoerli]: "0x02afbd43cad367fcb71305a2dfb9a3928218f0c1",
  [Network.Polygon]: "0x12b3897a36fdb436dde2788c06eff0ffd997066e",
};

export const NFTTransferProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0x4fee7b061c97c9c496b01dbce9cdb10c02f0a0be",
  [Network.EthereumGoerli]: "0x21b0b84ffab5a8c48291f5ec9d9fdb9aef574052",
  [Network.Polygon]: "0xd47e14dd9b98411754f722b4c4074e14752ada7c",
};

export const ERC20TransferProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0xb8e4526e0da700e9ef1f879af713d691f81507d8",
  [Network.EthereumGoerli]: "0x17cef9a8bf107d58e87c170be1652c06390bd990",
  [Network.Polygon]: "0x49b4e47079d9b733b2227fa15f0762dbf707b263",
};

export const ExchangeV1: ChainIdToAddress = {
  [Network.Ethereum]: "0xcd4ec7b66fbc029c116ba9ffb3e59351c20b5b06",
};
