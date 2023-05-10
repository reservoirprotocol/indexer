import { ChainIdToAddress, Network } from "../utils";

export const CollectionPoolEnumerableETH: ChainIdToAddress = {
  [Network.Ethereum]: "0x176607d4ae51289221a76fb1df82125bb44546ba",
  [Network.EthereumGoerli]: "0x862bd769d11503ec1413b6258bcc4ec404b3340a",
};

export const CollectionPoolMissingEnumerableETH: ChainIdToAddress = {
  [Network.Ethereum]: "0xc56d693f7a5f0019d37ac665ccf4211ddbe5d995",
  [Network.EthereumGoerli]: "0x86eebb3fbfad7250354d435ddef806e4da6ac6d8",
};

export const CollectionPoolEnumerableERC20: ChainIdToAddress = {
  [Network.Ethereum]: "0xebcc009ce93abe26936834d9d204571ab6dd83cd",
  [Network.EthereumGoerli]: "0xef9f304d35cc6ce379c4c0cdd71c2b0401c0d29f",
};

export const CollectionPoolMissingEnumerableERC20: ChainIdToAddress = {
  [Network.Ethereum]: "0x00c2880da9278f7a207f7775499b95f6f1f80922",
  [Network.EthereumGoerli]: "0xc14ec5cc6429b1385a7f0430d50e54523bd66574",
};

export const LinearCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xa675709085ebc5d4a2b5ccb70ce4b7bcd7b95b1c",
  [Network.EthereumGoerli]: "0xed0b81e4bd20ede0fb7901e9650101fd9a8fa92b",
};

export const ExponentialCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x02b1c4670e522a4259aa07f3be9071f14715d6fe",
  [Network.EthereumGoerli]: "0x1130d1dfebeb1ad7f196df62a5cff2146a380de2",
};

export const XykCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x7fb3758ff7b4296580c40be1a87405dc728d0702",
  [Network.EthereumGoerli]: "0x6f9f01c0500aa6de43d29d2487de53cd0ef2390d",
};

export const SigmoidCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x6458feb0e837c6fd49404a244aeecc1f41355d98",
  [Network.EthereumGoerli]: "0x213e6bc3bfd3f9da3f61a26441692a963f19fdc7",
};

export const CollectionPoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0x03b51826a4868780db375ee27e5b0adaac5274ee",
  [Network.EthereumGoerli]: "0x6e3e4e843e1ed2269b30f13e9057269253a279f8",
};

export const CollectionRouter: ChainIdToAddress = {
  [Network.Ethereum]: "0x9d8a2424700dfe6cd8c44917d899042f44ed2fc0",
  [Network.EthereumGoerli]: "0x4998a748f6e21a73ba423e9ffa192b91b969c6e5",
};
