import { ChainIdToAddress, Network } from "../utils";

export const CollectionPoolEnumerableETH: ChainIdToAddress = {
  [Network.Ethereum]: "0x9f95b3fc933e8d3acda1fca942c0e772c3b3e7d2",
  [Network.EthereumGoerli]: "0xb38b392edb9231b6eeed4910f30b92971035c254",
};

export const CollectionPoolMissingEnumerableETH: ChainIdToAddress = {
  [Network.Ethereum]: "0x71fe31fa53273aeee75678535d992dc1982433c9",
  [Network.EthereumGoerli]: "0x7f00ba2f7a32b85ea13f6826ba5edf1e14c30d47",
};

export const CollectionPoolEnumerableERC20: ChainIdToAddress = {
  [Network.Ethereum]: "0xe653a3deb851befedc7a1368b3cc20cc458f9800",
  [Network.EthereumGoerli]: "0xa3f271ffb95229687a39aeeca57b0779faf3e4bc",
};

export const CollectionPoolMissingEnumerableERC20: ChainIdToAddress = {
  [Network.Ethereum]: "0x833fd2704cdb5a68d22fcf674b0787cb9cbf63fb",
  [Network.EthereumGoerli]: "0x2efa7b790b2fbe4c535008b45c29e96841664450",
};

export const LinearCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xbc146a346892c1c2182d03414d2baaa10fb1d1cc",
  [Network.EthereumGoerli]: "0xe1e493a5cacceff8fc302356f9a1f3e353f6ac3a",
};

export const ExponentialCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0x79bfef94bf4eedfcce3823dad18daaf1169f3774",
  [Network.EthereumGoerli]: "0xf8b6ad5dd7f4e72932e6d30225f0cd22dfc62a14",
};

export const XykCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xd033db85bc8b5b76802221f7de400b34d1dfe744",
  [Network.EthereumGoerli]: "0x710e32d392722d3448f4d84e7ed96ce956647503",
};

export const SigmoidCurve: ChainIdToAddress = {
  [Network.Ethereum]: "0xac9a1bf50165a20f4249fac50c9822ef5c020114",
  [Network.EthereumGoerli]: "0x6051a2a8967c16395dfb5322df354194c3afd6d9",
};

export const LinearCurveWithSpreadInflator: ChainIdToAddress = {
  [Network.Ethereum]: "0x87811f06fd8533ee4c02115048828615289eb83b",
  [Network.EthereumGoerli]: "0xf22cebf02e796259f33828a8ee0e1a2c99946c9b",
};

export const ExponentialCurveWithSpreadInflator: ChainIdToAddress = {
  [Network.Ethereum]: "0x97f22d2068c60307074208935942d27abe5db599",
  [Network.EthereumGoerli]: "0x123d9359358febf459c1ba8a681a9c403bf7d2da",
};

export const CollectionPoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0x7a1d4c6e8edbd8a9314034356b29419e1b1b44f0",
  [Network.EthereumGoerli]: "0xe285994f188130757e045d9ffb95b99c24d6e84e",
};

export const CollectionRouter: ChainIdToAddress = {
  [Network.Ethereum]: "0xcbaadd5d0e512b07dab1bfc4346c3c79cba9566b",
  [Network.EthereumGoerli]: "0x27047724982f20f1652810797d16aff3df73c38a",
};
