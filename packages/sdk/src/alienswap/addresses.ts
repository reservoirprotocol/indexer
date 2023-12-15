import { ChainIdToAddress, Network } from "../utils";

// alienswap 交易所地址，得到 conduit controller后创建
export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x83746de31fc8de985ffe46c1c20ea6d7d8f4ed3a",
  [Network.EthereumGoerli]: "0x83746de31fc8de985ffe46c1c20ea6d7d8f4ed3a",
  [Network.ScrollAlpha]: "0x549380bfde8943f3c8ddb8be2132d012f8193e28",
  [Network.MantleTestnet]: "0xc04dd964ed36c0e4796f53a7168393ed4fc38ff6",
  [Network.LineaTestnet]: "0xf30ab0a2378d5dc1436f81c72d2784748a863938",
  [Network.Linea]: "0xa1085b85991cbe1cf2a4a328c8fb5f0c4b3f7aed",
  [Network.BaseGoerli]: "0x9c390efb05e09982e23993ebfa3b32c190e25f4b",
  [Network.Base]: "0x878dd5e0c3dedfebff67046bb218fb03c26e3e47",
  [Network.EthereumSepolia]: "0x33c551effdf1dbde4ffeaa133b2757819bd1353d",
  [Network.X1Testnet]: "0x5119384015e153a299f381f773832dd63a88f411",
  [Network.ZkFairTestnet]: "0x8c7Be07991311e509b55db91A37F9817bC758996",
};

// conduit key, 创建conduit时指定
export const AlienswapConduitKey: ChainIdToAddress = {
  [Network.Ethereum]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
  [Network.EthereumGoerli]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
  [Network.ScrollAlpha]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.MantleTestnet]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.LineaTestnet]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.Linea]: "0xffa0cb9f057d077d85655be8823961c4fd4cb56a000000000000000000000001",
  [Network.BaseGoerli]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.Base]: "0xffa0cb9f057d077d85655be8823961c4fd4cb56a000000000000000000000000",
  [Network.EthereumSepolia]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.X1Testnet]: "0xe8c0b0df50215e70269fb55eabd568088e0ad50c000000000000000000000000",
  [Network.ZkFairTestnet]: "0xc41a6ce1e045f9b0c9629b4c08518aee9d259af2000000000000000000000000",
};
