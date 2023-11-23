import { ChainIdToAddress, Network } from "../../../utils";

export const Module: ChainIdToAddress = {
  // Testnets
  [Network.EthereumGoerli]: "0x4df1c16c6761e999ff587568be1468d4cfb17c37",
  [Network.EthereumSepolia]: "0x69f2888491ea07bb10936aa110a5e0481122efd3",
  [Network.ZoraTestnet]: "0xb04cc34baa7af3a3466fcc442e302b7666e64e9a",
  [Network.BaseGoerli]: "0x27eb35119dda39df73db6681019edc4c16311acc",
};
