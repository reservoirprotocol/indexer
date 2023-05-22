import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const redeemed: EventData = {
  kind: "nftx",
  subKind: "nftx-redeemed",
  topic: "0x63b13f6307f284441e029836b0c22eb91eb62a7ad555670061157930ce884f4e",
  numTopics: 1,
  abi: new Interface([
    `event Redeemed(
      uint256[] nftIds,
      uint256[] specificIds,
      address to
    )`,
  ]),
};

export const minted: EventData = {
  kind: "nftx",
  subKind: "nftx-minted",
  topic: "0x1f72ad2a14447fa756b6f5aca53504645af79813493aca2d906b69e4aaeb9492",
  numTopics: 1,
  abi: new Interface([
    `event Minted(
      uint256[] nftIds,
      uint256[] amounts,
      address to
    )`,
  ]),
};

export const swapped: EventData = {
  kind: "nftx",
  subKind: "nftx-swapped",
  topic: "0x66982ed4a058811a8004bdcec9adcb3671f2b4f1a788667a3a74959d7c09af3c",
  numTopics: 1,
  abi: new Interface([
    `event Swapped(
      uint256[] nftIds,
      uint256[] amounts,
      uint256[] specificIds, 
      uint256[] redeemedIds, 
      address to
    )`,
  ]),
};

export const swap: EventData = {
  kind: "nftx",
  subKind: "nftx-swap",
  topic: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
  numTopics: 3,
  abi: new Interface([
    `event Swap(
      address indexed sender,
      uint256 amount0In,
      uint256 amount1In,
      uint256 amount0Out,
      uint256 amount1Out,
      address indexed to
    )`,
  ]),
};

export const swapV3: EventData = {
  kind: "nftx",
  subKind: "nftx-swap-v3",
  topic: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  numTopics: 3,
  abi: new Interface([
    `event Swap(
      address indexed sender,
      address indexed recipient,
      int256 amount0,
      int256 amount1,
      uint160 sqrtPriceX96,
      uint128 liquidity,
      int24 tick
    )`,
  ]),
};

export const mint: EventData = {
  kind: "nftx",
  subKind: "nftx-mint",
  topic: "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f",
  numTopics: 2,
  abi: new Interface([
    `event Mint(
      address indexed sender,
      uint256 amount0,
      uint256 amount1
    )`,
  ]),
};

export const burn: EventData = {
  kind: "nftx",
  subKind: "nftx-burn",
  topic: "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496",
  numTopics: 3,
  abi: new Interface([
    `event Burn(
      address indexed sender,
      uint256 amount0,
      uint256 amount1,
      address indexed to
    )`,
  ]),
};

export const vaultInit: EventData = {
  kind: "nftx",
  subKind: "nftx-vault-init",
  topic: "0x18ecce5c418b882a3d89e5b6cc8100dc3383309b8e78525266fe1283a7f934d6",
  numTopics: 2,
  abi: new Interface([
    `event VaultInit(
      uint256 indexed vaultId,
      address assetAddress,
      bool is1155,
      bool allowAllItems
    )`,
  ]),
};

export const vaultShutdown: EventData = {
  kind: "nftx",
  subKind: "nftx-vault-shutdown",
  topic: "0x1f6d756c685d4969a551099165b59f836b4d2cc7e036e623f0248c28bff91db5",
  numTopics: 1,
  abi: new Interface([
    `event VaultShutdown(
      address assetAddress,
      uint256 numItems,
      address recipient
    )`,
  ]),
};

export const eligibilityDeployed: EventData = {
  kind: "nftx",
  subKind: "nftx-eligibility-deployed",
  topic: "0x1f6d756c685d4969a551099165b59f836b4d2cc7e036e623f0248c28bff91db5",
  numTopics: 1,
  abi: new Interface([
    `event EligibilityDeployed(
      uint256 moduleIndex,
      address eligibilityAddr
    )`,
  ]),
};

export const enableMintUpdated: EventData = {
  kind: "nftx",
  subKind: "nftx-enable-mint-updated",
  topic: "0xc604be2f834727754dc1ec1225c14d1ecde48e7d12fa7b745dfb137a3db998bd",
  numTopics: 1,
  abi: new Interface([`event EnableMintUpdated(bool enabled)`]),
};

export const enableTargetRedeemUpdated: EventData = {
  kind: "nftx",
  subKind: "nftx-enable-target-redeem-updated",
  topic: "0x64b60f32742df47d4ccb5b31ca12fee1bc20695467bfe8fa058b00ec446c1563",
  numTopics: 1,
  abi: new Interface([`event EnableTargetRedeemUpdated(bool enabled)`]),
};
