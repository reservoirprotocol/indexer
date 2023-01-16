import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const redeemed: EventData = {
  kind: "nftx-redeemed",
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
  kind: "nftx-minted",
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

export const staked: EventData = {
  kind: "nftx-user-staked",
  topic: "0x9f69538b20901013ea360bae2dce4079d45308fcfed02b3f0768c9f70f4ba9c0",
  numTopics: 1,
  abi: new Interface([
    `event UserStaked(
      uint256 vaultId,
      uint256 count,
      uint256 lpBalance,
      uint256 timelockUntil,
      address sender
    )`,
  ]),
};

export const swapped: EventData = {
  kind: "nftx-swapped",
  topic: "0x66982ed4a058811a8004bdcec9adcb3671f2b4f1a788667a3a74959d7c09af3c",
  numTopics: 1,
  abi: new Interface([
    `event Swapped (
      uint256[] nftIds,
      uint256[] amounts,
      uint256[] specificIds, 
      uint256[] redeemedIds, 
      address to
    )`,
  ]),
};

export const vaultInit: EventData = {
  kind: "nftx-vault-init",
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
  kind: "nftx-vault-shutdown",
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
  kind: "nftx-eligibility-deployed",
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
  kind: "nftx-enable-mint-updated",
  topic: "0xc604be2f834727754dc1ec1225c14d1ecde48e7d12fa7b745dfb137a3db998bd",
  numTopics: 1,
  abi: new Interface([`event EnableMintUpdated(bool enabled)`]),
};

export const enableTargetRedeemUpdated: EventData = {
  kind: "nftx-enable-target-redeem-updated",
  topic: "0x64b60f32742df47d4ccb5b31ca12fee1bc20695467bfe8fa058b00ec446c1563",
  numTopics: 1,
  abi: new Interface([`event EnableTargetRedeemUpdated(bool enabled)`]),
};
