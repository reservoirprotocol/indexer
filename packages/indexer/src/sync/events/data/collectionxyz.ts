import { Interface } from "@ethersproject/abi";
import { CollectionXyz } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const newPool: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-new-pool",
  addresses: {
    [CollectionXyz.Addresses.CollectionPoolFactory[config.chainId]?.toLowerCase()]: true,
  },
  topic: "0x77948cb83ef3caff9ac13dfab1ea1f8a6875c98370287ce587f5dbc74cc5b6b0",
  numTopics: 3,
  abi: new Interface([
    `event NewPool(
      address indexed collection,
      address indexed poolAddress
    )`,
  ]),
};

export const tokenDeposit: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-token-deposit",
  topic: "0x98c09d9949722bae4bd0d988d4050091c3ae7ec6d51d3c6bbfe4233593944e9e",
  numTopics: 3,
  abi: new Interface([
    `event TokenDeposit(
      address indexed collection,
      address indexed token,
      uint256 amount
    )`,
  ]),
};

export const tokenWithdrawal: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-token-withdrawal",
  topic: "0x42856d0378dde02337bb59ae41747abc77ded8ebdbbc5cbdd1e53693b7554938",
  numTopics: 3,
  abi: new Interface([
    `event TokenWithdrawal(
      address indexed collection,
      address indexed token,
      uint256 amount
    )`,
  ]),
};

export const nftDeposit: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-nft-deposit",
  topic: "0xb4327b2c450d194fdd3f07f2c9bd9ffb1115db8758ad3e64fcfdee8a1e03eb96",
  numTopics: 2,
  abi: new Interface([
    `event NFTDeposit(
      address indexed collection,
      uint256 numNFTs,
      uint256 rawBuyPrice,
      uint256 rawSellPrice
    )`,
  ]),
};

export const nftWithdrawal: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-nft-withdrawal",
  topic: "0x87549f46ca104b4154ea78e211f03ab95ac4ceaae46063a9aefc532a46f7077f",
  numTopics: 2,
  abi: new Interface([
    `event NFTWithdrawal(
      address indexed collection,
      uint256 numNFTs,
      uint256 rawBuyPrice,
      uint256 rawSellPrice
    )`,
  ]),
};

export const accruedTradeFeeWithdrawal: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-accrued-trade-fee-withdrawal",
  topic: "0x1d798b54c652992f1c5b7b71eedc0c8efd202554d1ed775e937f71eabc48f7d6",
  numTopics: 2,
  abi: new Interface([
    `event AccruedTradeFeeWithdrawal(
      address indexed collection,
      address token,
      uint256 amount
    )`,
  ]),
};

export const acceptsTokenIds: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-accepts-token-ids",
  topic: "0xbb96907d84012be4929db4f46271567e28c4e06930a015d33d84c4e4070a8639",
  numTopics: 3,
  abi: new Interface([
    `event AcceptsTokenIDs(
      address indexed _collection,
      bytes32 indexed _root,
      bytes _data
    )`,
  ]),
};

export const swapNftInPool: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-swap-nft-in-pool",
  topic: "0xa62c6a3b86d7ec60477f03969fc8b3d05c95811c88fc9199f0180c327e8e9513",
  numTopics: 1,
  abi: new Interface([
    `event SwapNFTInPool(
      uint256[] nftIds,
      uint256 outputAmount,
      uint256 tradeFee,
      uint256 protocolFee,
      tuple(uint256 amount, address recipient)[] royaltyDue
    )`,
  ]),
};

export const swapNftOutPool: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-swap-nft-out-pool",
  topic: "0xf393cadbb1a243405899ddd94a5d0bf25599a6da2c5e04d511852c38a257b679",
  numTopics: 1,
  abi: new Interface([
    `event SwapNFTOutPool(
      uint256[] nftIds,
      uint256 inputAmount,
      uint256 tradeFee,
      uint256 protocolFee,
      tuple(uint256 amount, address recipient)[] royaltyDue
    )`,
  ]),
};

export const spotPriceUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-spot-price-update",
  topic: "0xf06180fdbe95e5193df4dcd1352726b1f04cb58599ce58552cc952447af2ffbb",
  numTopics: 1,
  abi: new Interface([
    `event SpotPriceUpdate(
      uint128 newSpotPrice
    )`,
  ]),
};

export const deltaUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-delta-update",
  topic: "0xc958ae052d28f8d17bc2c4ddbabb699a3cab5cccefd034d0fc971efdadc01da5",
  numTopics: 1,
  abi: new Interface([
    `event DeltaUpdate(
      uint128 newDelta
    )`,
  ]),
};

export const propsUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-props-update",
  topic: "0x5e769c368965e35f8e30cecfee20cc204350647488979ab82be96b8dd0a4e4d9",
  numTopics: 1,
  abi: new Interface([
    `event PropsUpdate(
      bytes newProps
    )`,
  ]),
};

export const stateUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-state-update",
  topic: "0x8a8f1ed7a28f7a5ee9bfeb2807fdcd20995f0b557ea36a5e58986d48157564df",
  numTopics: 1,
  abi: new Interface([
    `event StateUpdate(
      bytes newState
    )`,
  ]),
};

export const royaltyNumeratorUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-royalty-numerator-update",
  topic: "0xaf0e8aef3bc5a3d5a5b83ba31153b263887af44d6b84446e4621f3b382363905",
  numTopics: 1,
  abi: new Interface([
    `event RoyaltyNumeratorUpdate(
      uint24 newRoyaltyNumerator
    )`,
  ]),
};

export const royaltyRecipientFallbackUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-royalty-recipient-fallback-update",
  topic: "0xbf39288e4c534e4fc3b36f6d2bb2b1b2ff286e2d17c436d3b47abafe8ea4f064",
  numTopics: 2,
  abi: new Interface([
    `event RoyaltyRecipientFallbackUpdate(
      address indexed newFallback
    )`,
  ]),
};

export const externalFilterSet: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-external-filter-set",
  topic: "0xe2ec939da1f1286314ff4749a3fb8b3d4f4cdcf0cc910c1d97aab00fee437fe2",
  numTopics: 3,
  abi: new Interface([
    `event ExternalFilterSet(
      address indexed collection,
      address indexed filterAddress
    )`,
  ]),
};

export const feeUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-fee-update",
  topic: "0x66c55c30868c51e7ad52e3d85d1403576a9967614e67c48e25b55a10baa650c0",
  numTopics: 1,
  abi: new Interface([
    `event FeeUpdate(
      uint96 newFee
    )`,
  ]),
};

export const protocolFeeMultiplierUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-protocol-fee-multiplier-update",
  topic: "0xfd8ee7249e8f6c22d7d3c71093c7e935b7468f133a2a9a807ae4635c70f8cf9b",
  numTopics: 1,
  abi: new Interface([
    `event ProtocolFeeMultiplierUpdate(
      uint24 newMultiplier
    )`,
  ]),
};

export const carryFeeMultiplierUpdate: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-carry-fee-multiplier-update",
  topic: "0x1b45b945f2f80d1a9748b57c798253b355141f89518cbe965586e5d20cf62ed0",
  numTopics: 1,
  abi: new Interface([
    `event CarryFeeMultiplierUpdate(
      uint24 newMultiplier
    )`,
  ]),
};

export const assetRecipientChange: EventData = {
  kind: "collectionxyz",
  subKind: "collectionxyz-asset-recipient-change",
  topic: "0x678f61dcdee86474eddea0407caf8f1f5130382a90dedabaef94906ed86a27b4",
  numTopics: 2,
  abi: new Interface([
    `event AssetRecipientChange(
      address indexed a
    )`,
  ]),
};
