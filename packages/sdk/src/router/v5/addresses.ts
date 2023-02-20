import { ChainIdToAddress, Network } from "../../utils";

export const Router: ChainIdToAddress = {
  [Network.Ethereum]: "0x9ebfb53fa8526906738856848a27cb11b0285c3f", // V5_0_0
  [Network.EthereumGoerli]: "0x4e650642393ac992553b8fdd98be7750e99660cc", // V5_0_0
  [Network.Polygon]: "0x343621b9e3ee47b6ac5eb3343ca50137e56d8a70", // V5_0_0
  [Network.Optimism]: "0x41216f11a8481843de3e4986c388f1cc8780b724", // V5_0_0
};
