import { ChainIdToAddress, Network } from "../utils";

export const DittoPoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0xa2b251b40efe3a52513d94ce13952568d5962aed",
  [Network.EthereumGoerli]: "0xf316cff1170e9f04e8edb4f67d9d5bcdd84f142b",
};

export const LpNft: ChainIdToAddress = {
  [Network.Ethereum]: "0x8a036d6350a9794ae94b486a516cca7b9d80c0db",
  [Network.EthereumGoerli]: "0x4881fa5995a6a811032d48ca460fda02626b4592",
};

export const DittoPoolRouter: ChainIdToAddress = {
  [Network.Ethereum]: "0x3c65ce9156965d5abae80bab0a57b469a9921185",
  [Network.EthereumGoerli]: "0x7f04e2fa9a2e4f545d34f56aef2c3dc3dcf9204b",
};

export const DittoPoolRouterRoyalties: ChainIdToAddress = {
  [Network.Ethereum]: "0x932f75063d1a2711e4ca9dd3dad785f718eaed67",
  [Network.EthereumGoerli]: "0x24b1f548d90d393eb6ca073dce6cb90783ed1d93",
};

export const Test721: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x0133b5f5601d0b2980ac812a1719760ba3ea53e7",
};

export const Test20: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x8caa8de40048c4c840014bdec44373548b61568d",
};

export const UpshotOracle: ChainIdToAddress = {
  [Network.Ethereum]: "0xab484060281f073eed1519a7899cbde4b1af4695",
  [Network.EthereumGoerli]: "0x6c9808cb1fb906f34d9ab96b7b58ef91a67062b5",
};
