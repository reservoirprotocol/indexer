import { ChainIdToAddress, Network } from "../../../utils";

export const Module: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0x6c30a570d602515821de568b15a6214a5bf7fa5f",
  [Network.EthereumSepolia]: "0xd04d42429b36ae07de931beda07bcaefa5b31070",
  [Network.ZoraTestnet]: "0xcc2dad8af1d1e98a54c88d47faca30dc1a1c4fa8",
  [Network.BaseGoerli]: "0x9de1cc86b65fbf7d2dcb1e60d8568c44645bcaba",
};
