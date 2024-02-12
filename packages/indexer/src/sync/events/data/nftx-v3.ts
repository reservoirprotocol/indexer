import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const vaultInit: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-vault-init",
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
  kind: "nftx-v3",
  subKind: "nftx-v3-vault-shutdown",
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

export const enableMintUpdated: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-enable-mint-updated",
  topic: "0xc604be2f834727754dc1ec1225c14d1ecde48e7d12fa7b745dfb137a3db998bd",
  numTopics: 1,
  abi: new Interface([`event EnableMintUpdated(bool enabled)`]),
};

export const enableRedeemUpdated: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-enable-redeem-updated",
  topic: "0x9cb1d0c0b8d946b3eb09abb16f0a2546f919a9bff8ced6d73c2a1a36a4ff9521",
  numTopics: 1,
  abi: new Interface([`event EnableRedeemUpdated(bool enabled)`]),
};

export const enableSwapUpdated: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-enable-swap-updated",
  topic: "0x8f4dc19a0a35d805af4e9053cf101831ab5200b9b57fd5c953cee436833b892b",
  numTopics: 1,
  abi: new Interface([`event EnableSwapUpdated(bool enabled)`]),
};

export const redeemed: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-redeemed",
  topic: "0xddf3c6319e89d061b877ebc529b0fd59410499b5bf683cffa46d5807dd13c600",
  numTopics: 1,
  abi: new Interface([
    `event Redeemed(
      uint256[] specificIds,
      address to
    )`,
  ]),
};

export const minted: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-minted",
  topic: "0xf03937e99971e84e889dea1d728cb1c06a82314f012c0d203598c3d30fff4bd9",
  numTopics: 1,
  abi: new Interface([
    `event Minted(
      uint256[] nftIds,
      uint256[] amounts,
      address to,
      address depositor
    )`,
  ]),
};

export const swapped: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-swapped",
  topic: "0xc7f0d2d89a4f78b0df43fe593f76318f25e022d249bef3e8eb923d1b168c4faf",
  numTopics: 1,
  abi: new Interface([
    `event Swapped(
      uint256[] nftIds,
      uint256[] amounts,
      uint256[] specificIds,
      address to,
      address depositor
    )`,
  ]),
};

export const swap: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-swap",
  topic: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  numTopics: 3,
  abi: new Interface([
    `event Swap(
      address indexed sender,
      uint256 amount0,
      uint256 amount1,
      unit160 sqrtPriceX96,
      uint128 liquidity,
      int24 tick,
      address indexed recipient
    )`,
  ]),
};

export const eligibilityDeployed: EventData = {
  kind: "nftx-v3",
  subKind: "nftx-v3-eligibility-deployed",
  topic: "0xe14c63b3d4272158635bee1d1b95b51bb8de042ee95a15cbfaf2865b4d0af811",
  numTopics: 1,
  abi: new Interface([
    `event EligibilityDeployed(
      uint256 moduleIndex,
      address eligibilityAddr
    )`,
  ]),
};
