import { ChainIdToAddress, Network } from "../utils";

export const Escrow: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0x2b8763751a3141dee02ac83290a3426161fe591a",
  [Network.EthereumSepolia]: "0xcc2dad8af1d1e98a54c88d47faca30dc1a1c4fa8",
  [Network.ZoraTestnet]: "0x502108cf03891f0fc4e69042290711f97bedefca",
  [Network.BaseGoerli]: "0xef82b43719dd13ba33ef7d93e6f0d1f690eea5b2",
};
