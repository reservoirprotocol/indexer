import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.EthereumGoerli]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.Optimism]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.Gnosis]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.Polygon]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.PolygonMumbai]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.Arbitrum]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.AvalancheFuji]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
  [Network.Avalanche]: "0x00000000000001ad428e4906ae43d8f9852d0dd6",
};

export const ConduitController: ChainIdToAddress = {
  [Network.Ethereum]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.EthereumGoerli]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.Optimism]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.Gnosis]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.Polygon]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.PolygonMumbai]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.Arbitrum]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.AvalancheFuji]: "0x00000000f9490004c11cef243f5400493c00ad63",
  [Network.Avalanche]: "0x00000000f9490004c11cef243f5400493c00ad63",
};

// Conduits

export const OpenseaConduitKey: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
  [Network.EthereumGoerli]: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
  [Network.Polygon]: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
  [Network.Optimism]: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
};

export const OpenseaConduit: ChainIdToAddress = {
  [Network.Ethereum]: "0x1e0049783f008a0085193e00003d00cd54003c71",
  [Network.EthereumGoerli]: "0x1e0049783f008a0085193e00003d00cd54003c71",
  [Network.Polygon]: "0x1e0049783f008a0085193e00003d00cd54003c71",
  [Network.Optimism]: "0x1e0049783f008a0085193e00003d00cd54003c71",
};

// Zones

export const PausableZone: ChainIdToAddress = {
  [Network.Ethereum]: "0x004c00500000ad104d7dbd00e3ae0a5c00560c00",
  [Network.Polygon]: "0x004c00500000ad104d7dbd00e3ae0a5c00560c00",
};

export const ApprovalOrderZone: ChainIdToAddress = {};

export const CancellationZone: ChainIdToAddress = {
  [Network.Ethereum]: "0xe1066481cc3b038badd0c68dfa5c8f163c3ff192",
  [Network.EthereumGoerli]: "0x49b91d1d7b9896d28d370b75b92c2c78c1ac984a",
};
