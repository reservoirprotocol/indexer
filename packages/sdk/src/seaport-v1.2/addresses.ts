import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.EthereumGoerli]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.Optimism]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.Gnosis]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.Polygon]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.PolygonMumbai]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.Arbitrum]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.AvalancheFuji]: "0x00000000000006c7676171937c444f6bde3d6282",
  [Network.Avalanche]: "0x00000000000006c7676171937c444f6bde3d6282",
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
  [Network.Ethereum]:
    "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
  [Network.EthereumGoerli]:
    "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
  [Network.Polygon]:
    "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
  [Network.Optimism]:
    "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
};

export const OpenseaConduit: ChainIdToAddress = {
  [Network.Ethereum]: "0x1e0049783f008a0085193e00003d00cd54003c71",
  [Network.EthereumGoerli]: "0x1e0049783f008a0085193e00003d00cd54003c71",
  [Network.Polygon]: "0x1e0049783f008a0085193e00003d00cd54003c71",
  [Network.Optimism]: "0x1e0049783f008a0085193e00003d00cd54003c71",
};

// Zones

export const PausableZone: ChainIdToAddress = {};

export const ApprovalOrderZone: ChainIdToAddress = {};

export const CancelXZone: ChainIdToAddress = {};
