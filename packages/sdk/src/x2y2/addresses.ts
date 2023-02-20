import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x74312363e45dcaba76c59ec49a7aa8a65a67eed3",
  [Network.EthereumGoerli]: "0x1891ecd5f7b1e751151d857265d6e6d08ae8989e",
};

export const Erc721Delegate: ChainIdToAddress = {
  [Network.Ethereum]: "0xf849de01b080adc3a814fabe1e2087475cf2e354",
  [Network.EthereumGoerli]: "0x095be13d86000260852e4f92ea48dc333fa35249",
};

export const FeeManager: ChainIdToAddress = {
  [Network.Ethereum]: "0xd823c605807cc5e6bd6fc0d7e4eea50d3e2d66cd",
  [Network.EthereumGoerli]: "0x809eed76f38d7c62461f8c5ececce3a8224c1707",
};
