import { Interface } from "@ethersproject/abi";

import * as erc20 from "@/events-sync/data/erc20";
import * as erc721 from "@/events-sync/data/erc721";
import * as erc1155 from "@/events-sync/data/erc1155";

import * as bendDao from "@/events-sync/data/bend-dao";
import * as blur from "@/events-sync/data/blur";
import * as collectionxyz from "@/events-sync/data/collectionxyz";
import * as cryptoPunks from "@/events-sync/data/cryptopunks";
import * as decentraland from "@/events-sync/data/decentraland";
import * as element from "@/events-sync/data/element";
import * as flow from "@/events-sync/data/flow";
import * as foundation from "@/events-sync/data/foundation";
import * as looksRare from "@/events-sync/data/looks-rare";
import * as manifold from "@/events-sync/data/manifold";
import * as nftTrader from "@/events-sync/data/nft-trader";
import * as nftx from "@/events-sync/data/nftx";
import * as nouns from "@/events-sync/data/nouns";
import * as okex from "@/events-sync/data/okex";
import * as quixotic from "@/events-sync/data/quixotic";
import * as rarible from "@/events-sync/data/rarible";
import * as seaport from "@/events-sync/data/seaport";
import * as seaportV14 from "@/events-sync/data/seaport-v1.4";
import * as seaportV15 from "@/events-sync/data/seaport-v1.5";
import * as alienswap from "@/events-sync/data/alienswap";
import * as sudoswap from "@/events-sync/data/sudoswap";
import * as superrare from "@/events-sync/data/superrare";
import * as tofu from "@/events-sync/data/tofu";
import * as treasure from "@/events-sync/data/treasure";
import * as universe from "@/events-sync/data/universe";
import * as wyvernV2 from "@/events-sync/data/wyvern-v2";
import * as wyvernV23 from "@/events-sync/data/wyvern-v2.3";
import * as x2y2 from "@/events-sync/data/x2y2";
import * as zeroExV2 from "@/events-sync/data/zeroex-v2";
import * as zeroExV3 from "@/events-sync/data/zeroex-v3";
import * as zeroExV4 from "@/events-sync/data/zeroex-v4";
import * as zora from "@/events-sync/data/zora";
import * as looksRareV2 from "@/events-sync/data/looks-rare-v2";
import * as blend from "@/events-sync/data/blend";
import * as sudoswapV2 from "@/events-sync/data/sudoswap-v2";

// All events we're syncing should have an associated `EventData`
// entry which dictates the way the event will be parsed and then
// handled (eg. persisted to the database and relayed for further
// processing to any job queues)

// Event kind by protocol/standard
export type EventKind =
  | "erc20"
  | "erc721"
  | "erc1155"
  | "bend-dao"
  | "blur"
  | "collectionxyz"
  | "cryptopunks"
  | "decentraland"
  | "element"
  | "flow"
  | "foundation"
  | "looks-rare"
  | "manifold"
  | "nft-trader"
  | "nftx"
  | "nouns"
  | "okex"
  | "quixotic"
  | "rarible"
  | "seaport"
  | "sudoswap"
  | "superrare"
  | "tofu"
  | "treasure"
  | "universe"
  | "wyvern"
  | "x2y2"
  | "zeroex-v2"
  | "zeroex-v3"
  | "zeroex-v4"
  | "zora"
  | "looks-rare-v2"
  | "blend"
  | "sudoswap-v2";

// Event sub-kind in each of the above protocol/standard
export type EventSubKind =
  | "erc721-transfer"
  | "erc721-like-transfer"
  | "erc721-erc20-like-transfer"
  | "erc721-consecutive-transfer"
  | "erc1155-transfer-single"
  | "erc1155-transfer-batch"
  | "erc721/1155-approval-for-all"
  | "erc20-approval"
  | "erc20-transfer"
  | "weth-deposit"
  | "weth-withdrawal"
  | "wyvern-v2-orders-matched"
  | "wyvern-v2.3-orders-matched"
  | "looks-rare-cancel-all-orders"
  | "looks-rare-cancel-multiple-orders"
  | "looks-rare-taker-ask"
  | "looks-rare-taker-bid"
  | "zeroex-v4-erc721-order-cancelled"
  | "zeroex-v4-erc1155-order-cancelled"
  | "zeroex-v4-erc721-order-filled"
  | "zeroex-v4-erc1155-order-filled"
  | "foundation-buy-price-set"
  | "foundation-buy-price-invalidated"
  | "foundation-buy-price-cancelled"
  | "foundation-buy-price-accepted"
  | "x2y2-order-cancelled"
  | "x2y2-order-inventory"
  | "seaport-order-cancelled"
  | "seaport-order-filled"
  | "seaport-counter-incremented"
  | "seaport-order-validated"
  | "seaport-v1.4-order-cancelled"
  | "seaport-v1.4-order-filled"
  | "seaport-v1.4-orders-matched"
  | "seaport-v1.4-counter-incremented"
  | "seaport-v1.4-order-validated"
  | "seaport-v1.5-order-cancelled"
  | "seaport-v1.5-order-filled"
  | "seaport-v1.5-orders-matched"
  | "seaport-v1.5-counter-incremented"
  | "seaport-v1.5-order-validated"
  | "alienswap-order-cancelled"
  | "alienswap-order-filled"
  | "alienswap-orders-matched"
  | "alienswap-counter-incremented"
  | "alienswap-order-validated"
  | "rarible-match"
  | "rarible-cancel"
  | "rarible-buy-v1"
  | "rarible-match-v2"
  | "element-erc721-sell-order-filled"
  | "element-erc721-sell-order-filled-v2"
  | "element-erc721-buy-order-filled"
  | "element-erc721-buy-order-filled-v2"
  | "element-erc1155-sell-order-filled"
  | "element-erc1155-sell-order-filled-v2"
  | "element-erc1155-buy-order-filled"
  | "element-erc1155-buy-order-filled-v2"
  | "element-erc721-order-cancelled"
  | "element-erc1155-order-cancelled"
  | "element-hash-nonce-incremented"
  | "quixotic-order-filled"
  | "zora-ask-filled"
  | "zora-ask-created"
  | "zora-ask-price-updated"
  | "zora-ask-cancelled"
  | "zora-auction-ended"
  | "nouns-auction-settled"
  | "cryptopunks-punk-offered"
  | "cryptopunks-punk-no-longer-for-sale"
  | "cryptopunks-punk-bought"
  | "cryptopunks-punk-transfer"
  | "cryptopunks-assign"
  | "cryptopunks-transfer"
  | "sudoswap-buy"
  | "sudoswap-sell"
  | "sudoswap-token-deposit"
  | "sudoswap-token-withdrawal"
  | "sudoswap-spot-price-update"
  | "sudoswap-delta-update"
  | "sudoswap-new-pair"
  | "universe-match"
  | "universe-cancel"
  | "nftx-redeemed"
  | "nftx-minted"
  | "nftx-user-staked"
  | "nftx-swapped"
  | "nftx-swap"
  | "nftx-swap-v3"
  | "nftx-mint"
  | "nftx-burn"
  | "nftx-vault-init"
  | "nftx-vault-shutdown"
  | "nftx-eligibility-deployed"
  | "nftx-enable-mint-updated"
  | "nftx-enable-target-redeem-updated"
  | "blur-orders-matched"
  | "flow-match-order-fulfilled"
  | "flow-take-order-fulfilled"
  | "flow-cancel-all-orders"
  | "flow-cancel-multiple-orders"
  | "blur-order-cancelled"
  | "blur-nonce-incremented"
  | "manifold-purchase"
  | "manifold-modify"
  | "manifold-cancel"
  | "manifold-finalize"
  | "manifold-accept"
  | "tofu-inventory-update"
  | "decentraland-sale"
  | "nft-trader-swap"
  | "okex-order-filled"
  | "bend-dao-taker-ask"
  | "bend-dao-taker-bid"
  | "superrare-listing-filled"
  | "superrare-sold"
  | "superrare-accept-offer"
  | "superrare-auction-settled"
  | "superrare-set-sale-price"
  | "zeroex-v2-fill"
  | "zeroex-v3-fill"
  | "treasure-item-sold"
  | "treasure-bid-accepted"
  | "looks-rare-v2-new-bid-ask-nonces"
  | "looks-rare-v2-order-nonces-cancelled"
  | "looks-rare-v2-subset-nonces-cancelled"
  | "looks-rare-v2-taker-ask"
  | "looks-rare-v2-taker-bid"
  | "blend-loan-offer-taken"
  | "blend-repay"
  | "blend-refinance"
  | "blend-buy-locked"
  | "blend-nonce-incremented"
  | "collectionxyz-new-pool"
  | "collectionxyz-token-deposit"
  | "collectionxyz-token-withdrawal"
  | "collectionxyz-nft-deposit"
  | "collectionxyz-nft-withdrawal"
  | "collectionxyz-accrued-trade-fee-withdrawal"
  | "collectionxyz-accepts-token-ids"
  | "collectionxyz-swap-nft-in-pool"
  | "collectionxyz-swap-nft-out-pool"
  | "collectionxyz-spot-price-update"
  | "collectionxyz-delta-update"
  | "collectionxyz-props-update"
  | "collectionxyz-state-update"
  | "collectionxyz-royalty-numerator-update"
  | "collectionxyz-royalty-recipient-fallback-update"
  | "collectionxyz-external-filter-set"
  | "collectionxyz-fee-update"
  | "collectionxyz-protocol-fee-multiplier-update"
  | "collectionxyz-carry-fee-multiplier-update"
  | "collectionxyz-asset-recipient-change"
  | "sudoswap-v2-sell-erc721"
  | "sudoswap-v2-sell-erc1155"
  | "sudoswap-v2-buy-erc721"
  | "sudoswap-v2-buy-erc1155"
  | "sudoswap-v2-token-deposit"
  | "sudoswap-v2-token-withdrawal"
  | "sudoswap-v2-nft-withdrawal-erc721"
  | "sudoswap-v2-nft-withdrawal-erc1155"
  | "sudoswap-v2-erc20-deposit"
  | "sudoswap-v2-erc721-deposit"
  | "sudoswap-v2-erc1155-deposit"
  | "sudoswap-v2-spot-price-update"
  | "sudoswap-v2-delta-update"
  | "sudoswap-v2-new-erc721-pair"
  | "sudoswap-v2-new-erc1155-pair";

export type EventData = {
  kind: EventKind;
  subKind: EventSubKind;
  addresses?: { [address: string]: boolean };
  topic: string;
  numTopics: number;
  abi: Interface;
};

const allEventData = [
  erc20.approval,
  erc20.transfer,
  erc20.deposit,
  erc20.withdrawal,
  erc721.transfer,
  erc721.likeTransfer,
  erc721.erc20LikeTransfer,
  erc721.approvalForAll,
  erc721.consecutiveTransfer,
  erc1155.transferSingle,
  erc1155.transferBatch,
  foundation.buyPriceAccepted,
  foundation.buyPriceCancelled,
  foundation.buyPriceInvalidated,
  foundation.buyPriceSet,
  looksRare.cancelAllOrders,
  looksRare.cancelMultipleOrders,
  looksRare.takerAsk,
  looksRare.takerBid,
  looksRareV2.newBidAskNonces,
  looksRareV2.orderNoncesCancelled,
  looksRareV2.subsetNoncesCancelled,
  looksRareV2.takerAsk,
  looksRareV2.takerBid,
  seaport.counterIncremented,
  seaport.orderCancelled,
  seaport.orderFulfilled,
  seaport.orderValidated,
  seaportV14.counterIncremented,
  seaportV14.orderCancelled,
  seaportV14.orderFulfilled,
  seaportV14.ordersMatched,
  seaportV14.orderValidated,
  seaportV15.counterIncremented,
  seaportV15.orderCancelled,
  seaportV15.orderFulfilled,
  seaportV15.ordersMatched,
  seaportV15.orderValidated,
  alienswap.counterIncremented,
  alienswap.orderCancelled,
  alienswap.orderFulfilled,
  alienswap.ordersMatched,
  alienswap.orderValidated,
  wyvernV2.ordersMatched,
  wyvernV23.ordersMatched,
  zeroExV4.erc721OrderCancelled,
  zeroExV4.erc1155OrderCancelled,
  zeroExV4.erc721OrderFilled,
  zeroExV4.erc1155OrderFilled,
  x2y2.orderCancelled,
  x2y2.orderInventory,
  rarible.match,
  rarible.cancel,
  rarible.buyV1,
  rarible.matchV2,
  element.erc721BuyOrderFilled,
  element.erc721BuyOrderFilledV2,
  element.erc721SellOrderFilled,
  element.erc721SellOrderFilledV2,
  element.erc1155BuyOrderFilled,
  element.erc1155BuyOrderFilledV2,
  element.erc1155SellOrderFilled,
  element.erc1155SellOrderFilledV2,
  element.erc721OrderCancelled,
  element.erc1155OrderCancelled,
  element.hashNonceIncremented,
  quixotic.orderFulfilled,
  zora.askFilled,
  zora.askCreated,
  zora.askCancelled,
  zora.askPriceUpdated,
  zora.auctionEnded,
  nouns.auctionSettled,
  cryptoPunks.punkOffered,
  cryptoPunks.punkNoLongerForSale,
  cryptoPunks.punkBought,
  cryptoPunks.punkTransfer,
  cryptoPunks.assign,
  cryptoPunks.transfer,
  sudoswap.buy,
  sudoswap.sell,
  sudoswap.tokenDeposit,
  sudoswap.tokenWithdrawal,
  sudoswap.spotPriceUpdate,
  sudoswap.deltaUpdate,
  sudoswap.newPair,
  universe.match,
  universe.cancel,
  nftx.minted,
  nftx.redeemed,
  nftx.swapped,
  nftx.swap,
  nftx.mint,
  nftx.burn,
  nftx.vaultInit,
  nftx.vaultShutdown,
  nftx.eligibilityDeployed,
  nftx.enableMintUpdated,
  nftx.enableTargetRedeemUpdated,
  blur.ordersMatched,
  flow.matchOrderFulfilled,
  flow.takeOrderFulfilled,
  flow.cancelAllOrders,
  flow.cancelMultipleOrders,
  blur.orderCancelled,
  blur.nonceIncremented,
  manifold.modify,
  manifold.finalize,
  manifold.purchase,
  manifold.cancel,
  manifold.accept,
  tofu.inventoryUpdate,
  decentraland.sale,
  nftTrader.swap,
  okex.orderFulfilled,
  bendDao.takerAsk,
  bendDao.takerBid,
  superrare.listingFilled,
  superrare.listingSold,
  superrare.offerAccept,
  superrare.auctionSettled,
  superrare.setSalePrice,
  zeroExV2.fill,
  zeroExV3.fill,
  treasure.itemSold,
  blend.buyLocked,
  blend.loanOfferTaken,
  blend.refinance,
  blend.repay,
  blend.nonceIncremented,
  collectionxyz.acceptsTokenIds,
  collectionxyz.accruedTradeFeeWithdrawal,
  collectionxyz.assetRecipientChange,
  collectionxyz.carryFeeMultiplierUpdate,
  collectionxyz.deltaUpdate,
  collectionxyz.externalFilterSet,
  collectionxyz.feeUpdate,
  collectionxyz.newPool,
  collectionxyz.nftDeposit,
  collectionxyz.nftWithdrawal,
  collectionxyz.propsUpdate,
  collectionxyz.protocolFeeMultiplierUpdate,
  collectionxyz.royaltyNumeratorUpdate,
  collectionxyz.royaltyRecipientFallbackUpdate,
  collectionxyz.spotPriceUpdate,
  collectionxyz.stateUpdate,
  collectionxyz.swapNftInPool,
  collectionxyz.swapNftOutPool,
  collectionxyz.tokenDeposit,
  collectionxyz.tokenWithdrawal,
  sudoswapV2.buyERC1155,
  sudoswapV2.buyERC721,
  sudoswapV2.sellERC721,
  sudoswapV2.sellERC1155,
  sudoswapV2.tokenDeposit,
  sudoswapV2.tokenWithdrawal,
  sudoswapV2.nftWithdrawalERC721,
  sudoswapV2.nftWithdrawalERC1155,
  sudoswapV2.erc20Deposit,
  sudoswapV2.erc721Deposit,
  sudoswapV2.erc1155Deposit,
  sudoswapV2.spotPriceUpdate,
  sudoswapV2.deltaUpdate,
  sudoswapV2.newERC721Pair,
  sudoswapV2.newERC1155Pair,
  treasure.bidAccepted,
];

export const getEventData = (events?: string[]) => {
  if (!events) {
    return allEventData;
  } else {
    return allEventData.filter(({ subKind }) => events.some((e) => subKind.startsWith(e)));
  }
};
