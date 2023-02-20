import { ChainIdToAddress, Network } from "../utils";

export const PairFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0xb16c1342e617a5b6e4b631eb114483fdb289c0a4",
};

export const RouterWithRoyalties: ChainIdToAddress = {
  [Network.Ethereum]: "0x844d04f79d2c58dcebf8fff1e389fccb1401aa49",
};

export const LinearCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x5b6ac51d9b1cede0068a1b26533cace807f883ee",
};

export const ExponentialCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x432f962d8209781da23fb37b6b59ee15de7d9841",
};

export const XykCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x7942e264e21c5e6cbba45fe50785a15d3beb1da0",
};
