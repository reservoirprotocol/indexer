import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x6170b3c3a54c3d8c854934cbc314ed479b2b29a3",
  [Network.EthereumGoerli]: "0xd8be3e8a8648c4547f06e607174bac36f5684756",
  [Network.Polygon]: "0x3634e984ba0373cfa178986fd19f03ba4dd8e469",
};

export const AuctionHouse: ChainIdToAddress = {
  [Network.Ethereum]: "0xe468ce99444174bd3bbbed09209577d25d1ad673",
};

export const ModuleManager: ChainIdToAddress = {
  [Network.Ethereum]: "0x850a7c6fe2cf48eea1393554c8a3ba23f20cc401",
  [Network.EthereumGoerli]: "0x9458e29713b98bf452ee9b2c099289f533a5f377",
  [Network.Polygon]: "0xcca379fdf4beda63c4bb0e2a3179ae62c8716794",
};

export const Erc721TransferHelper: ChainIdToAddress = {
  [Network.Ethereum]: "0x909e9efe4d87d1a6018c2065ae642b6d0447bc91",
  [Network.EthereumGoerli]: "0xd1adaf05575295710de1145c3c9427c364a70a7f",
  [Network.Polygon]: "0xce6cef2a9028e1c3b21647ae3b4251038109f42a",
};

export const Erc20TransferHelper: ChainIdToAddress = {
  [Network.Ethereum]: "0xcca379fdf4beda63c4bb0e2a3179ae62c8716794",
  [Network.EthereumGoerli]: "0x53172d999a299198a935f9e424f9f8544e3d4292",
  [Network.Polygon]: "0x909e9efe4d87d1a6018c2065ae642b6d0447bc91",
};

export const ERC1155Factory: ChainIdToAddress = {
  [Network.Ethereum]: "0xa6c5f2de915240270dac655152c3f6a91748cb85",
  [Network.Optimism]: "0x78b524931e9d847c40bcbf225c25e154a7b05fda",
  [Network.Zora]: "0x35ca784918bf11692708c1d530691704aacea95e",
};

export const ERC1155FactoryV2: ChainIdToAddress = {
  [Network.Ethereum]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
  [Network.Optimism]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
  [Network.Zora]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
};

export const ERC1155ZoraFixedPriceEMinter: ChainIdToAddress = {
  [Network.Ethereum]: "0x04e2516a2c207e84a1839755675dfd8ef6302f0a",
  [Network.Optimism]: "0x3678862f04290e565cca2ef163baeb92bb76790c",
  [Network.Base]: "0x04e2516a2c207e84a1839755675dfd8ef6302f0a",
  [Network.Arbitrum]: "0x1cd1c1f3b8b779b50db23155f2cb244fcca06b21",
  [Network.Blast]: "0x3eb144aee170bf62fda1536e38af51f08e34a5d0",
  [Network.Zora]: "0x04e2516a2c207e84a1839755675dfd8ef6302f0a",
};

export const ERC1155ZoraMerkleMinter: ChainIdToAddress = {
  [Network.Ethereum]: "0xf48172ca3b6068b20ee4917eb27b5472f1f272c7",
  [Network.Optimism]: "0x899ce31df6c6af81203acaad285bf539234ef4b8",
  [Network.Base]: "0xf48172ca3b6068b20ee4917eb27b5472f1f272c7",
  [Network.Arbitrum]: "0xe770e6f19aecf8ef3145a50087999b5556ab3610",
  [Network.Blast]: "0xb9c997fcc46a27331cc986cc2416ee99c1d506c3",
  [Network.Zora]: "0xf48172ca3b6068b20ee4917eb27b5472f1f272c7",
};
