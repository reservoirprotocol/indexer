import { ChainIdToAddress, Network } from "../utils";

export const CollectionPoolEnumerableETH: ChainIdToAddress = {
  [Network.Ethereum]: "0x176607d4ae51289221A76FB1df82125Bb44546Ba",
  [Network.EthereumGoerli]: "0x862Bd769D11503EC1413B6258bcC4EC404B3340a",
};

export const CollectionPoolMissingEnumerableETH: ChainIdToAddress = {
  [Network.Ethereum]: "0xc56d693F7A5F0019D37ac665ccF4211ddbe5d995",
  [Network.EthereumGoerli]: "0x86EeBB3fbfAD7250354D435DdEf806e4da6aC6D8",
};

export const CollectionPoolEnumerableERC20: ChainIdToAddress = {
  [Network.Ethereum]: "0xebCC009CE93aBE26936834d9d204571aB6Dd83cD",
  [Network.EthereumGoerli]: "0xef9F304D35cc6CE379C4c0cDD71C2b0401C0d29F",
};

export const CollectionPoolMissingEnumerableERC20: ChainIdToAddress = {
  [Network.Ethereum]: "0x00c2880Da9278f7A207F7775499b95f6f1F80922",
  [Network.EthereumGoerli]: "0xc14Ec5CC6429b1385A7F0430d50E54523bD66574",
};

export const LinearCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xa675709085ebC5d4A2B5Ccb70Ce4b7bcD7B95B1c",
  [Network.EthereumGoerli]: "0xed0b81E4bd20Ede0fb7901E9650101fD9A8fa92b",
};

export const ExponentialCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x02b1C4670E522A4259Aa07f3BE9071F14715D6fe",
  [Network.EthereumGoerli]: "0x1130D1DfeBEb1Ad7F196df62A5cff2146A380de2",
};

export const XykCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x7fB3758Ff7b4296580c40bE1A87405dC728D0702",
  [Network.EthereumGoerli]: "0x6f9f01C0500aa6dE43D29D2487De53cD0Ef2390d",
};

export const SigmoidCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x6458FEB0e837c6Fd49404a244AEEcc1F41355d98",
  [Network.EthereumGoerli]: "0x213E6bC3bfd3F9da3F61a26441692A963F19fdc7",
};

export const CollectionPoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0x03b51826a4868780DB375eE27E5b0AdaaC5274EE",
  [Network.EthereumGoerli]: "0x6e3E4E843e1Ed2269b30f13E9057269253A279f8",
};

export const CollectionRouter: ChainIdToAddress = {
  [Network.Ethereum]: "0x9d8A2424700Dfe6CD8c44917D899042F44ed2fc0",
  [Network.EthereumGoerli]: "0x4998A748F6E21a73Ba423E9fFA192b91b969c6E5",
};
