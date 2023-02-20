import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
  [Network.EthereumGoerli]: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
  [Network.Optimism]: "0xdef1abe32c034e558cdd535791643c58a13acc10",
  [Network.Polygon]: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
};

export const Eth: ChainIdToAddress = {
  [Network.Ethereum]: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [Network.EthereumGoerli]: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [Network.Optimism]: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  [Network.Polygon]: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
};

export const TokenRangeValidator: ChainIdToAddress = {
  [Network.Ethereum]: "0xf4a4daa2e20f3d249d53e74a15b6a0518c27927d",
};

export const BitVectorValidator: ChainIdToAddress = {
  [Network.Ethereum]: "0x345db61cf74cea41c0a58155470020e1392eff2b",
};

export const PackedListValidator: ChainIdToAddress = {
  [Network.Ethereum]: "0xda9881fcdf8e73d57727e929380ef20eb50521fe",
};
