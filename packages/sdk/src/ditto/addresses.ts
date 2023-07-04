import { ChainIdToAddress, Network } from "../utils";

export const Pool: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x2f4776214A9741F3E97E3CB4C0D9Fd75B4777687",
};

export const PoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0xF7cd2CD77eEbC441ac31F17d52006Dc1De0eF538",
};

export const Test721: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x5979F4164A5873f23e354090f0a70bC7a60D0CA1",
};

export const Test20: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x4B3B968a56e0354694cc212D8EbB2c3e8944C15B",
};


