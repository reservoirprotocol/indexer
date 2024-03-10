import { ChainIdToAddress, Network } from "../utils";

export const NativeEthAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x20f780a973856b93f63670377900c1d2a50a77c4",
  [Network.Bsc]: "0xb3e3dfcb2d9f3dde16d78b9e6eb3538eb32b5ae1",
  [Network.Polygon]: "0xeaf5453b329eb38be159a872a6ce91c9a8fb0260",
  [Network.Avalanche]: "0x18cd9270dbdca86d470cfb3be1b156241fffa9de",
  [Network.Arbitrum]: "0x18cd9270dbdca86d470cfb3be1b156241fffa9de",
  [Network.Zksync]: "0x64848eefbc2921102a153b08fa64536ae1f8e937",
  [Network.Linea]: "0x0cab6977a9c70e04458b740476b498b214019641",
  [Network.Base]: "0xa39a5f160a1952ddf38781bd76e402b0006912a9",
  [Network.Opbnb]: "0x5417c5215f239b8d04f9d9c04bf43034b35ad4bd",
  [Network.Optimism]: "0x2317d8b224328644759319dffa2a5da77c72e0e9",
  [Network.Scroll]: "0x0cab6977a9c70e04458b740476b498b214019641",
  [Network.Blast]: "0x4196b39157659bf0de9ebf6e505648b7889a39ce",
};
