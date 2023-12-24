import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x3a3548e060be10c2614d0a4cb0c03cc9093fd799",
  [Network.EthereumGoerli]: "0x554fa73be2f122374e148b35de3ed6c34602dbf6",
};

export const ERC721LazyPayableClaim: ChainIdToAddress = {
  [Network.Ethereum]: "0x1eb73fee2090fb1c20105d5ba887e3c3ba14a17e",
  [Network.Optimism]: "0x1eb73fee2090fb1c20105d5ba887e3c3ba14a17e",
  [Network.Base]: "0x1eb73fee2090fb1c20105d5ba887e3c3ba14a17e",
};

export const ERC1155LazyPayableClaim: ChainIdToAddress = {
  [Network.Ethereum]: "0xe7d3982e214f9dfd53d23a7f72851a7044072250",
  [Network.Optimism]: "0x04ba6cf3c5aa6d4946f5b7f7adf111012a9fac65",
  [Network.Base]: "0x04ba6cf3c5aa6d4946f5b7f7adf111012a9fac65",
};
