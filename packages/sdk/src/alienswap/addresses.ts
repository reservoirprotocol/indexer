import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x1a7cd1373a34cf37a1a9ce16e9876492808e7388",
  [Network.EthereumGoerli]: "0x05955cddd8b737dac33a03e70b3e15b6c4b0d765",
};

export const AlienswapConduitKey: ChainIdToAddress = {
  [Network.Ethereum]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
  [Network.EthereumGoerli]: "0xb9f312a053a074bc69bbae4caa423d74b1301cc6000000000000000000000000",
};
