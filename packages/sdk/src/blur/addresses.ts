import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x000000000000ad05ccc4f10045630fb830b95127",
  [Network.EthereumGoerli]: "0xf957cd5cefb06e136ab3ccc3d0c4283eb3886c0c",
};

export const StandardPolicyERC721: ChainIdToAddress = {
  [Network.Ethereum]: "0x00000000006411739da1c40b106f8511de5d1fac",
  [Network.EthereumGoerli]: "0xde0cdfc21ad03afe917efa4e8811fc3fb4e8f027",
};

export const StandardPolicyERC721_V2: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000dab4a563819e8fd93dba3b25bc3495"
};

export const StandardPolicyERC1155: ChainIdToAddress = {
  [Network.EthereumGoerli]: "0x4146c41a880b0f1f1b22f31c6354f23a7f6be8b2",
};

export const ExecutionDelegate: ChainIdToAddress = {
  [Network.Ethereum]: "0x00000000000111abe46ff893f3b2fdf1f759a8a8",
  [Network.EthereumGoerli]: "0xfc66fc912bb51d8a60cfbabb051e9bd8b68e223b"
};

export const MerkleVerifier: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x85f535fd285693d9542c48784cfe36803de495bc"
}

export const PolicyManager: ChainIdToAddress = {
  [Network.Ethereum]: "0x3a35a3102b5c6bd1e4d3237248be071ef53c8331",
  [Network.EthereumGoerli]: "0xc73c52c261ba61a222618a9ebc27ae79a18377d9"
}

export const Oracle: ChainIdToAddress = {
  [Network.Ethereum]: "0xd44feab097e5fee7fd54c9481f56b806f7f3ddc1",
  [Network.EthereumGoerli]: "0xe11816134ddd8728752995ee36e3b3cc72873166"
}

export const BETH: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000a39bb272e79075ade125fd351887ac",
}