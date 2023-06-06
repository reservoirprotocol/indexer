import { ChainIdToAddress, Network } from "../utils";

export const PairFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0xa020d57ab0448ef74115c112d18a9c231cc86000",
  [Network.EthereumGoerli]: "0x967544b2dd5c1c7a459e810c9b60ae4fc8227201",
};

export const VeryFastRouter = {
  [Network.Ethereum]: "0x090c236b62317db226e6ae6cd4c0fd25b7028b65",
  [Network.EthereumGoerli]: "0xb3d6192e9940bba479c32596431d215faee5f723",
};

export const GDACurve = {
  [Network.Ethereum]: "0x1fd5876d4a3860eb0159055a3b7cb79fdfff6b67",
  [Network.EthereumGoerli]: "0x5e9a0ef66a6bc2e6ac7c9811374521f7bad89e53",
};

export const XykCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xc7fb91b6cd3c67e02ec08013cebb29b1241f3de5",
  [Network.EthereumGoerli]: "0x8f03234e08a0068572d3afe10c45d4840d3f29e8",
};

export const ExponentialCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xfa056c602ad0c0c4ee4385b3233f2cb06730334a",
  [Network.EthereumGoerli]: "0x60c3aeeb3b8fade6df3dfdc52a4630d492cdd7e7",
};

export const LinearCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xe5d78fec1a7f42d2f3620238c498f088a866fdc5",
  [Network.EthereumGoerli]: "0x9fe1e403c043214017a6719c1b64190c634229ef",
};

export const RoyaltyEngine = {
  [Network.Ethereum]: "0xbc40d21999b4bf120d330ee3a2de415287f626c9",
};

export const Router: ChainIdToAddress = {
  [Network.Ethereum]: "0x844d04f79d2c58dcebf8fff1e389fccb1401aa49",
};
