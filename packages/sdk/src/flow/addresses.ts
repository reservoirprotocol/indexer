import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0xf1000142679a6a57abd2859d18f8002216b0ac2b",
  [Network.EthereumGoerli]: "0xa79c18bcdd5c45d4f58317609fe1b6c6a5b623b2",
  [Network.Polygon]: "0xf1000142679a6a57abd2859d18f8002216b0ac2b",
};

export const Complication: ChainIdToAddress = {
  [Network.Ethereum]: "0xf10003fcf6e1215f5a579bcfe9b2614d1badaef8",
  [Network.EthereumGoerli]: "0xb9ef3e81f83201f8a8c0d59c4ab392526661899e",
  [Network.Polygon]: "0xf10003fcf6e1215f5a579bcfe9b2614d1badaef8",
};

export const ComplicationV2: ChainIdToAddress = {
  [Network.Ethereum]: "0xf10005a7e799cfd16bd71a3344e463dcdaac1c97",
  [Network.EthereumGoerli]: "0x70b13420db2d02b2fa2f4b7b9be257062e10b7ca",
  [Network.Polygon]: "0xf10005a7e799cfd16bd71a3344e463dcdaac1c97",
};
