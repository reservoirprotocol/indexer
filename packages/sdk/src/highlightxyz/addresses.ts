import { ChainIdToAddress, Network } from "../utils";

export const MintManager: ChainIdToAddress = {
  [Network.Ethereum]: "0x1bf979282181f2b7a640d17ab5d2e25125f2de5e",
  [Network.Optimism]: "0xfafd47bb399d570b5ac95694c5d2a1fb5ea030bb",
  [Network.Polygon]: "0xfbb65c52f439b762f712026cf6dd7d8e82f81eb9",
  [Network.Base]: "0x8087039152c472fa74f47398628ff002994056ea",
  [Network.Arbitrum]: "0x41cbab1028984a34c1338f437c726de791695ae8",
  [Network.Zora]: "0x3ad45858a983d193d98bd4e6c14852a4cadcdbea",
};

export const DiscreteDutchAuctionMechanic: ChainIdToAddress = {
  [Network.Ethereum]: "0x94fa6e7fc2555ada63ea56cfff425558360f0074",
};
