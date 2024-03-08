import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x83746de31fc8de985ffe46c1c20ea6d7d8f4ed3a",
  [Network.EthereumGoerli]: "0x83746de31fc8de985ffe46c1c20ea6d7d8f4ed3a",
  [Network.MantleTestnet]: "0xc04dd964ed36c0e4796f53a7168393ed4fc38ff6",
  [Network.LineaTestnet]: "0xf30ab0a2378d5dc1436f81c72d2784748a863938",
  [Network.Linea]: "0xa1085b85991cbe1cf2a4a328c8fb5f0c4b3f7aed",
  [Network.Base]: "0x878dd5e0c3dedfebff67046bb218fb03c26e3e47",
  [Network.EthereumSepolia]: "0x33c551effdf1dbde4ffeaa133b2757819bd1353d",
  [Network.Arbitrum]: "0xb52fdd8f3821cc60ba4583a822f03317de544bc2",
  [Network.Optimism]: "0xb52fdd8f3821cc60ba4583a822f03317de544bc2",
  [Network.Scroll]: "0xb52fdd8f3821cc60ba4583a822f03317de544bc2",
};

export const AlienswapConduitKey: ChainIdToAddress = {
  [Network.Ethereum]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
  [Network.EthereumGoerli]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
  [Network.MantleTestnet]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.LineaTestnet]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.Linea]: "0xffa0cb9f057d077d85655be8823961c4fd4cb56a000000000000000000000001",
  [Network.Base]: "0xffa0cb9f057d077d85655be8823961c4fd4cb56a000000000000000000000000",
  [Network.EthereumSepolia]: "0x7e727520b29773e7f23a8665649197aaf064cef1000000000000000000000000",
  [Network.Arbitrum]: "0xffa0cb9f057d077d85655be8823961c4fd4cb56a000000000000000000000000",
  [Network.Optimism]: "0xffa0cb9f057d077d85655be8823961c4fd4cb56a000000000000000000000000",
  [Network.Scroll]: "0xffa0cb9f057d077d85655be8823961c4fd4cb56a000000000000000000000000",
};
