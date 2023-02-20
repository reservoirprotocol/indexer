import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x59728544b08ab483533076417fbbb2fd0b17ce3a",
  [Network.EthereumGoerli]: "0xd112466471b5438c1ca2d218694200e49d81d047",
};

export const StrategyStandardSaleDeprecated: ChainIdToAddress = {
  [Network.Ethereum]: "0x56244bb70cbd3ea9dc8007399f61dfc065190031",
  [Network.EthereumGoerli]: "0xc771c0a3a7d738a1e12aa88829a658baefb32f0f",
};

export const StrategyStandardSale: ChainIdToAddress = {
  [Network.Ethereum]: "0x579af6fd30bf83a5ac0d636bc619f98dbdeb930c",
  [Network.EthereumGoerli]: "0x6acbeb7f6e225fbc0d1cee27a40adc49e7277e57",
};

export const StrategyCollectionSaleDeprecated: ChainIdToAddress = {
  [Network.Ethereum]: "0x86f909f70813cdb1bc733f4d97dc6b03b8e7e8f3",
  [Network.EthereumGoerli]: "0xef722abf61a1937e76dacfcd58d51c2358de7d1a",
};

export const StrategyCollectionSale: ChainIdToAddress = {
  [Network.Ethereum]: "0x09f93623019049c76209c26517acc2af9d49c69b",
  [Network.EthereumGoerli]: "0xafb81825dc076500bf19cbf69d443684f2ebd3f6",
};

export const TransferManagerErc721: ChainIdToAddress = {
  [Network.Ethereum]: "0xf42aa99f011a1fa7cda90e5e98b277e306bca83e",
  [Network.EthereumGoerli]: "0xf8c81f3ae82b6efc9154c69e3db57fd4da57ab6e",
};

export const TransferManagerErc1155: ChainIdToAddress = {
  [Network.Ethereum]: "0xfed24ec7e22f573c2e08aef55aa6797ca2b3a051",
  [Network.EthereumGoerli]: "0xf2ae42e871937f4e9ffb394c5a814357c16e06d6",
};
