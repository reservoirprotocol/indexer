import { ChainIdToAddress, Network } from "../utils";

export const Escrow: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0xde86a52ec16f96d46a1ee8f8a36559a6246148ad",
  [Network.EthereumSepolia]: "0x086cd67c39646e95c1b9c4af4694aa51a1a7636f",
  [Network.ZoraTestnet]: "0xd04d42429b36ae07de931beda07bcaefa5b31070",
  [Network.BaseGoerli]: "0x482e4d362c8a2ea19e07b7234a14084a7d740b42",
};

export const CallAndCheckZone: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0xd1c03c47da9e33b8a19234d745587cb4dcdae10d",
  [Network.EthereumSepolia]: "0x5088a0a51e45b5a00c049676dc11f12bb8b4ec29",
  [Network.ZoraTestnet]: "0x481456de34abffe5e72ceea597aab19d852e6413",
  [Network.BaseGoerli]: "0x9bf3d5f1fe800f6ce4219e09ffe1cd444109b2d8",
};
