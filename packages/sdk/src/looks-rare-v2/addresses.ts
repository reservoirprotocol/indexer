import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000e655fae4d56241588680f86e3b2377",
  [Network.EthereumGoerli]: "0x35c2215f2ffe8917b06454eeeaba189877f200cf",
};

export const TransferManager: ChainIdToAddress = {
  [Network.Ethereum]: "0x000000000060c4ca14cfc4325359062ace33fe3d",
  [Network.EthereumGoerli]: "0xc20e0cead98abbbeb626b77efb8dc1e5d781f90c",
};

export const ProtocolFeeRecipient: ChainIdToAddress = {
  [Network.Ethereum]: "0x1838de7d4e4e42c8eb7b204a91e28e9fad14f536",
};
