import * as Common from "./common";
import * as Global from "./global";

import * as RouterV6 from "./router/v6";

import * as Beeple from "./beeple";
import * as BendDao from "./bend-dao";
import * as Blur from "./blur";
import * as CollectionXyz from "./collectionxyz";
import * as CrossChain from "./cross-chain";
import * as CryptoArte from "./cryptoarte";
import * as CryptoKitties from "./cryptokitties";
import * as CryptoPunks from "./cryptopunks";
import * as CryptoVoxels from "./cryptovoxels";
import * as Decentraland from "./decentraland";
import * as Ditto from "./ditto";
import * as Element from "./element";
import * as Foundation from "./foundation";
import * as LooksRare from "./looks-rare";
import * as Manifold from "./manifold";
import * as NftTrader from "./nft-trader";
import * as Nftx from "./nftx";
import * as Nouns from "./nouns";
import * as Okex from "./okex";
import * as Quixotic from "./quixotic";
import * as Rarible from "./rarible";
import * as SeaportV11 from "./seaport-v1.1";
import * as SeaportV14 from "./seaport-v1.4";
import * as SeaportV15 from "./seaport-v1.5";
import * as Alienswap from "./alienswap";
import * as SeaportBase from "./seaport-base";
import * as Sudoswap from "./sudoswap";
import * as SuperRare from "./superrare";
import * as TofuNft from "./tofunft";
import * as Treasure from "./treasure";
import * as WyvernV2 from "./wyvern-v2";
import * as WyvernV23 from "./wyvern-v2.3";
import * as X2Y2 from "./x2y2";
import * as ZeroExV2 from "./zeroex-v2";
import * as ZeroExV3 from "./zeroex-v3";
import * as ZeroExV4 from "./zeroex-v4";
import * as Zora from "./zora";
import * as LooksRareV2 from "./looks-rare-v2";
import * as Blend from "./blend";
import * as SudoswapV2 from "./sudoswap-v2";
import * as Midaswap from "./midaswap";
import * as CaviarV1 from "./caviar-v1";
import * as PaymentProcessor from "./payment-processor";
import * as Seadrop from "./seadrop";
import * as BlurV2 from "./blur-v2";
import * as Joepeg from "./joepeg";

// Overrides (shouldn't belong here)
if (process.env.SEAPORT_V15_OVERRIDE) {
  const [chainId, address] = process.env.SEAPORT_V15_OVERRIDE.split(":");
  SeaportV15.Addresses.Exchange[Number(chainId)] = address;
}
if (process.env.CONDUIT_CONTROLLER_OVERRIDE) {
  const [chainId, address] = process.env.CONDUIT_CONTROLLER_OVERRIDE.split(":");
  SeaportBase.Addresses.ConduitController[Number(chainId)] = address;
}
if (process.env.CONDUIT_CONTROLLER_CODE_HASH_OVERRIDE) {
  const [chainId, address] = process.env.CONDUIT_CONTROLLER_CODE_HASH_OVERRIDE.split(":");
  SeaportBase.Addresses.ConduitControllerCodeHash[Number(chainId)] = address;
}
if (process.env.ROUTER_OVERRIDE) {
  const [chainId, address] = process.env.ROUTER_OVERRIDE.split(":");
  RouterV6.Addresses.Router[Number(chainId)] = address;
}
if (process.env.APPROVAL_PROXY_OVERRIDE) {
  const [chainId, address] = process.env.APPROVAL_PROXY_OVERRIDE.split(":");
  RouterV6.Addresses.ApprovalProxy[Number(chainId)] = address;
}

export {
  // Common
  Common,
  // Global
  Global,
  // Routers
  RouterV6,
  // Contracts / Protocols
  Beeple,
  BendDao,
  Blur,
  CollectionXyz,
  CrossChain,
  CryptoArte,
  CryptoKitties,
  CryptoPunks,
  CryptoVoxels,
  Decentraland,
  Ditto,
  Element,
  Foundation,
  LooksRare,
  Manifold,
  NftTrader,
  Nftx,
  Nouns,
  Okex,
  Quixotic,
  Rarible,
  SeaportV11,
  SeaportV14,
  SeaportV15,
  Alienswap,
  SeaportBase,
  Sudoswap,
  SuperRare,
  TofuNft,
  Treasure,
  WyvernV2,
  WyvernV23,
  X2Y2,
  ZeroExV2,
  ZeroExV3,
  ZeroExV4,
  Zora,
  LooksRareV2,
  Blend,
  SudoswapV2,
  Midaswap,
  CaviarV1,
  PaymentProcessor,
  Seadrop,
  BlurV2,
  Joepeg,
};
