import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0xffb4e9ebcd3c1c3ce216946d2600b6c613339a71",
  [Network.Optimism]: "0x9de1cc86b65fbf7d2dcb1e60d8568c44645bcaba",
  [Network.Zora]: "0x96fefdb0a543b3e30d8aaae865b7a48378d85382",
  [Network.EthereumGoerli]: "0x6afc65c964267bd4c10a488df5810d32a6c35b6e",
  [Network.EthereumSepolia]: "0x66f9085c4c751e35d473b51bb783579e9b5c8095",
  [Network.ZoraTestnet]: "0x97292e65ab745747971c4b4e992ffc5a51186c6a",
  [Network.BaseGoerli]: "0xb1096516fc33bb64a77158b10f155846e74bd7fa",
};
