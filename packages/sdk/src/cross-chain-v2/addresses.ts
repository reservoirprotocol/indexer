import { ChainIdToAddress, Network } from "../utils";

export const Escrow: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0x2b8763751a3141dee02ac83290a3426161fe591a",
  [Network.EthereumSepolia]: "0xcc2dad8af1d1e98a54c88d47faca30dc1a1c4fa8",
  [Network.ZoraTestnet]: "0x502108cf03891f0fc4e69042290711f97bedefca",
  [Network.BaseGoerli]: "0xef82b43719dd13ba33ef7d93e6f0d1f690eea5b2",
};

export const CallAndCheckZone: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0x3d5d033c2ee800ac129d9bfeac6fdd2b90969267",
  [Network.EthereumSepolia]: "0x208960b3bb6fa00bdcfa2cc9cdb8d412bbce9f64",
  [Network.ZoraTestnet]: "0x69f2888491ea07bb10936aa110a5e0481122efd3",
  [Network.BaseGoerli]: "0xf470ba53f14b1073cc16839c0f80474105d159a5",
};
