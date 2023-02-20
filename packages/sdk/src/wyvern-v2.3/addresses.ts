import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x7f268357a8c2552623316e2562d90e642bb538e5",
};

export const ProxyRegistry: ChainIdToAddress = {
  [Network.Ethereum]: "0xa5409ec958c83c3f309868babaca7c86dcb077c1",
};

export const TokenTransferProxy: ChainIdToAddress = {
  [Network.Ethereum]: "0xe5c783ee536cf5e63e792988335c4255169be4e1",
};

export const TokenListVerifier: ChainIdToAddress = {
  [Network.Ethereum]: "0x13ca300c11b70e555c7bc93f898f67503c8619c9",
};

export const TokenRangeVerifier: ChainIdToAddress = {
  [Network.Ethereum]: "0x12f313f763eab71481efb70fb0254a77ed6ab829",
};

export const OpenSeaMekleValidator: ChainIdToAddress = {
  [Network.Ethereum]: "0xbaf2127b49fc93cbca6269fade0f7f31df4c88a7",
};
