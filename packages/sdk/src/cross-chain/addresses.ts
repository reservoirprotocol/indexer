import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  // Mainnets
  [Network.Ethereum]: "0x4c86cac049c3c26563fcce7dd0a7a4c4c2178a5e",
  [Network.Optimism]: "0xf470ba53f14b1073cc16839c0f80474105d159a5",
  [Network.Arbitrum]: "0x7deb43ea42555922445abc2f8ec66d5fce8c92c0",
  [Network.ArbitrumNova]: "0x5c8a351d4ff680203e05af56cb9d748898c7b39a",
  [Network.Base]: "0x20794ef7693441799a3f38fcc22a12b3e04b9572",
  [Network.Zora]: "0xe1066481cc3b038badd0c68dfa5c8f163c3ff192",
  // Testnets
  [Network.EthereumGoerli]: "0x04e9cdd3e98c50d352c84db785fd8d5a5d986c44",
  [Network.EthereumSepolia]: "0x9763de988cb65a8389e68179c2d7e0350b937841",
};
