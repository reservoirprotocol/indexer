import { ChainIdToAddress, Network } from "../utils";

export const NativeEthAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x20f780a973856b93f63670377900c1d2a50a77c4",
  [Network.EthereumGoerli]: "0x7fed7ed540c0731088190fed191fcf854ed65efa",
};

export const Eth: ChainIdToAddress = {
  [Network.Ethereum]: NativeEthAddress,
  [Network.EthereumGoerli]: NativeEthAddress,
  [Network.Optimism]: NativeEthAddress,
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
