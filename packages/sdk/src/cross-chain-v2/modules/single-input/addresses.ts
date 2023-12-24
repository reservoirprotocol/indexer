import { ChainIdToAddress, Network } from "../../../utils";

export const Module: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0x12bc09532c1c9ed08944b2f351db8abbddf90b30",
  [Network.EthereumSepolia]: "0xb505c75f4d135c65a9806e2b8ff72b1816be931c",
  [Network.ZoraTestnet]: "0x208960b3bb6fa00bdcfa2cc9cdb8d412bbce9f64",
  [Network.BaseGoerli]: "0xc63cca6e3cf565921d3c8241f74ef7b1e404bb78",
};
