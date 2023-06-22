import { Interface } from "@ethersproject/abi";
import { SudoswapV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const sellERC721: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-sell-erc721",
  topic: "0x7a0e7e58d91fd23a96b0008604db1b2d1cee4aae434e3aad9a20fdd7c0995f89",
  numTopics: 1,
  abi: new Interface([`event SwapNFTInPair(uint256 amountOut, uint256[] ids)`]),
};

export const sellERC1155: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-sell-erc1155",
  topic: "0x58e7e2e8d4c949c019e4fe5f6e2a8f10e4e078a8747730386e9a230da8c969f0",
  numTopics: 1,
  abi: new Interface([`event SwapNFTInPair(uint256 amountOut, uint256 numNFTs)`]),
};

export const buyERC721: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-buy-erc721",
  topic: "0xa13c46268c53408442d94eb370f2e476cb7f0fbe027ae5bad73ce13d4469c8b9",
  numTopics: 1,
  abi: new Interface([`event SwapNFTOutPair(uint256 amountIn, uint256[] ids)`]),
};

export const buyERC1155: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-buy-erc1155",
  topic: "0xd9c2402e1a067734ae78dab98f06d5b28e8a2d2c6370ec0e6ff8cc2749d050f1",
  numTopics: 1,
  abi: new Interface([`event SwapNFTOutPair(uint256 amountIn, uint256 numNFTs)`]),
};

export const tokenDeposit: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-token-deposit",
  topic: "0xf1b3be8dace0fecfbdb6fb0fa1cc014c612bcb1b46db027c1ece5fc11fff09d6",
  numTopics: 1,
  abi: new Interface([`event TokenDeposit(uint256 amount)`]),
};

export const tokenWithdrawal: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-token-withdrawal",
  topic: "0x0e266e8f38544aa1480d73762386eb10df55b1b8453d935762e891c44b69a1e6",
  numTopics: 1,
  abi: new Interface([`event TokenWithdrawal(uint256 amount)`]),
};

export const nftWithdrawalERC721: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-nft-withdrawal-erc721",
  topic: "0x840318695eadabb7c175aa7b9a9b3f9bbd1cb2dd11e9374a159a090d7125f8c8",
  numTopics: 1,
  abi: new Interface([`event NFTWithdrawal(uint256[] ids)`]),
};
export const nftWithdrawalERC1155: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-nft-withdrawal-erc1155",
  topic: "0xd26d84b7e96b5b61cbb9f851a5a2953408c61abc7502e33a59d3e6146c0428b0",
  numTopics: 1,
  abi: new Interface([`event NFTWithdrawal(uint256 numNFTs)`]),
};

export const spotPriceUpdate: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-spot-price-update",
  topic: "0xf06180fdbe95e5193df4dcd1352726b1f04cb58599ce58552cc952447af2ffbb",
  numTopics: 1,
  abi: new Interface([`event SpotPriceUpdate(uint128 newSpotPrice)`]),
};

export const deltaUpdate: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-delta-update",
  topic: "0xc958ae052d28f8d17bc2c4ddbabb699a3cab5cccefd034d0fc971efdadc01da5",
  numTopics: 1,
  abi: new Interface([`event DeltaUpdate(uint128 newDelta)`]),
};

export const newERC721Pair: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-new-erc721-pair",
  addresses: { [SudoswapV2.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0xe8e1cee58c33f242c87d563bbc00f2ac82eb90f10a252b0ba8498ae6c1dc241a",
  numTopics: 2,
  abi: new Interface([`event NewERC721Pair(address indexed poolAddress, uint256[] initialIds)`]),
};

export const newERC1155Pair: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-new-erc1155-pair",
  addresses: { [SudoswapV2.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0x2966b6b401975e778520aec46cbefbe73799119a5670feda3e8f884c7c3ffb11",
  numTopics: 2,
  abi: new Interface([`event NewERC1155Pair(address indexed poolAddress, uint256 initialBalance)`]),
};

export const erc20Deposit: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-erc20-deposit",
  addresses: { [SudoswapV2.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0xc5a9c13052901cb7714b549fb3e30327a1049e8a6a814847fc70293cc6dec747",
  numTopics: 2,
  abi: new Interface([`event ERC20Deposit(address indexed poolAddress, uint256 amount)`]),
};

export const erc721Deposit: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-erc721-deposit",
  addresses: { [SudoswapV2.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0x232f0dddad405387becb8c1dd6afed4c32d6ce5d66105ebbbe38bc27c6843f63",
  numTopics: 2,
  abi: new Interface([`event NFTDeposit(address indexed poolAddress, uint256[] ids)`]),
};

export const erc1155Deposit: EventData = {
  kind: "sudoswap-v2",
  subKind: "sudoswap-v2-erc1155-deposit",
  addresses: { [SudoswapV2.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0xd9d59b1027358505410c5d75718be0c5f30233b2c78ce49b8951d7d0f99fa675",
  numTopics: 3,
  abi: new Interface([
    `event ERC1155Deposit(address indexed poolAddress, uint256 indexed id, uint256 amount)`,
  ]),
};
