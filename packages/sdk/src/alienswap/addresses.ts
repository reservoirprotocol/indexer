import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x83746de31fc8de985ffe46c1c20ea6d7d8f4ed3a",
  [Network.EthereumGoerli]: "0x83746de31fc8de985ffe46c1c20ea6d7d8f4ed3a",
  [Network.ScrollAlpha]: "0x549380bfde8943f3c8ddb8be2132d012f8193e28",
  [Network.LineaTestnet]: "0xf30ab0a2378d5dc1436f81c72d2784748a863938",
};

export const AlienswapConduitKey: ChainIdToAddress = {
  [Network.Ethereum]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
  [Network.EthereumGoerli]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
  [Network.ScrollAlpha]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.LineaTestnet]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
};
