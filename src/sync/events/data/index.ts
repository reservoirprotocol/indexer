import { Interface } from "@ethersproject/abi";

import * as erc20 from "@/events-sync/data/erc20";
import * as erc721 from "@/events-sync/data/erc721";
import * as erc1155 from "@/events-sync/data/erc1155";

import * as blur from "@/events-sync/data/blur";
import * as cryptoPunks from "@/events-sync/data/cryptopunks";
import * as decentraland from "@/events-sync/data/decentraland";
import * as element from "@/events-sync/data/element";
import * as forward from "@/events-sync/data/forward";
import * as foundation from "@/events-sync/data/foundation";
import * as looksRare from "@/events-sync/data/looks-rare";
import * as nftx from "@/events-sync/data/nftx";
import * as nouns from "@/events-sync/data/nouns";
import * as quixotic from "@/events-sync/data/quixotic";
import * as rarible from "@/events-sync/data/rarible";
import * as seaport from "@/events-sync/data/seaport";
import * as sudoswap from "@/events-sync/data/sudoswap";
import * as universe from "@/events-sync/data/universe";
import * as wyvernV2 from "@/events-sync/data/wyvern-v2";
import * as wyvernV23 from "@/events-sync/data/wyvern-v2.3";
import * as x2y2 from "@/events-sync/data/x2y2";
import * as zeroExV4 from "@/events-sync/data/zeroex-v4";
import * as zora from "@/events-sync/data/zora";
import * as manifold from "@/events-sync/data/manifold";
import * as tofu from "@/events-sync/data/tofu";
import * as nftTrader from "@/events-sync/data/nft-trader";
import * as okex from "@/events-sync/data/okex";
import * as bendDao from "@/events-sync/data/bend-dao";

// All events we're syncing should have an associated `EventData`
// entry which dictates the way the event will be parsed and then
// handled (eg. persisted to the database and relayed for further
// processing to any job queues)

export type EventDataKind =
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
  | "rarible-match"
  | "rarible-cancel"
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
  | "blur-orders-matched"
  | "blur-order-cancelled"
  | "blur-nonce-incremented"
  | "forward-order-filled"
  | "forward-order-cancelled"
  | "forward-counter-incremented"
  | "manifold-purchase"
  | "manifold-modify"
  | "manifold-cancel"
  | "manifold-finalize"
  | "tofu-inventory-update"
  | "decentraland-sale"
  | "nft-trader-swap"
  | "okex-order-filled"
  | "bend-dao-taker-ask"
  | "bend-dao-taker-bid";

export type EventData = {
  kind: EventDataKind;
  addresses?: { [address: string]: boolean };
  topic: string;
  numTopics: number;
  abi: Interface;
};

export const getEventData = (eventDataKinds?: EventDataKind[]) => {
  if (!eventDataKinds) {
    return [
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
      seaport.counterIncremented,
      seaport.orderCancelled,
      seaport.orderFulfilled,
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
      blur.ordersMatched,
      blur.orderCancelled,
      blur.nonceIncremented,
      forward.orderFilled,
      forward.orderCancelled,
      forward.counterIncremented,
      manifold.modify,
      manifold.finalize,
      manifold.purchase,
      manifold.cancel,
      tofu.inventoryUpdate,
      decentraland.sale,
      nftTrader.swap,
      okex.orderFulfilled,
      bendDao.takerAsk,
      bendDao.takerBid,
    ];
  } else {
    return (
      eventDataKinds
        .map(internalGetEventData)
        .filter(Boolean)
        // Force TS to remove `undefined`
        .map((x) => x!)
    );
  }
};

const internalGetEventData = (kind: EventDataKind): EventData | undefined => {
  switch (kind) {
    case "erc20-approval":
      return erc20.approval;
    case "erc20-transfer":
      return erc20.transfer;
    case "weth-deposit":
      return erc20.deposit;
    case "weth-withdrawal":
      return erc20.withdrawal;
    case "erc721-transfer":
      return erc721.transfer;
    case "erc721-like-transfer":
      return erc721.likeTransfer;
    case "erc721-erc20-like-transfer":
      return erc721.erc20LikeTransfer;
    case "erc721/1155-approval-for-all":
      return erc721.approvalForAll;
    case "erc721-consecutive-transfer":
      return erc721.consecutiveTransfer;
    case "erc1155-transfer-batch":
      return erc1155.transferBatch;
    case "erc1155-transfer-single":
      return erc1155.transferSingle;
    case "foundation-buy-price-accepted":
      return foundation.buyPriceAccepted;
    case "foundation-buy-price-cancelled":
      return foundation.buyPriceCancelled;
    case "foundation-buy-price-invalidated":
      return foundation.buyPriceInvalidated;
    case "foundation-buy-price-set":
      return foundation.buyPriceSet;
    case "wyvern-v2-orders-matched":
      return wyvernV2.ordersMatched;
    case "wyvern-v2.3-orders-matched":
      return wyvernV23.ordersMatched;
    case "looks-rare-cancel-all-orders":
      return looksRare.cancelAllOrders;
    case "looks-rare-cancel-multiple-orders":
      return looksRare.cancelMultipleOrders;
    case "looks-rare-taker-ask":
      return looksRare.takerAsk;
    case "looks-rare-taker-bid":
      return looksRare.takerBid;
    case "zeroex-v4-erc721-order-cancelled":
      return zeroExV4.erc721OrderCancelled;
    case "zeroex-v4-erc1155-order-cancelled":
      return zeroExV4.erc1155OrderCancelled;
    case "zeroex-v4-erc721-order-filled":
      return zeroExV4.erc721OrderFilled;
    case "zeroex-v4-erc1155-order-filled":
      return zeroExV4.erc1155OrderFilled;
    case "x2y2-order-cancelled":
      return x2y2.orderCancelled;
    case "x2y2-order-inventory":
      return x2y2.orderInventory;
    case "seaport-counter-incremented":
      return seaport.counterIncremented;
    case "seaport-order-cancelled":
      return seaport.orderCancelled;
    case "seaport-order-filled":
      return seaport.orderFulfilled;
    case "rarible-match":
      return rarible.match;
    case "rarible-cancel":
      return rarible.cancel;
    case "element-erc721-sell-order-filled":
      return element.erc721SellOrderFilled;
    case "element-erc721-sell-order-filled-v2":
      return element.erc721SellOrderFilledV2;
    case "element-erc721-buy-order-filled":
      return element.erc721BuyOrderFilled;
    case "element-erc721-buy-order-filled-v2":
      return element.erc721BuyOrderFilledV2;
    case "element-erc1155-sell-order-filled":
      return element.erc1155SellOrderFilled;
    case "element-erc1155-sell-order-filled-v2":
      return element.erc1155SellOrderFilledV2;
    case "element-erc1155-buy-order-filled":
      return element.erc1155BuyOrderFilled;
    case "element-erc1155-buy-order-filled-v2":
      return element.erc1155BuyOrderFilledV2;
    case "element-erc721-order-cancelled":
      return element.erc721OrderCancelled;
    case "element-erc1155-order-cancelled":
      return element.erc1155OrderCancelled;
    case "element-hash-nonce-incremented":
      return element.hashNonceIncremented;
    case "quixotic-order-filled":
      return quixotic.orderFulfilled;
    case "zora-ask-filled":
      return zora.askFilled;
    case "zora-ask-created":
      return zora.askCreated;
    case "zora-ask-cancelled":
      return zora.askCancelled;
    case "zora-ask-price-updated":
      return zora.askPriceUpdated;
    case "zora-auction-ended":
      return zora.auctionEnded;
    case "nouns-auction-settled":
      return nouns.auctionSettled;
    case "cryptopunks-punk-offered":
      return cryptoPunks.punkOffered;
    case "cryptopunks-punk-no-longer-for-sale":
      return cryptoPunks.punkNoLongerForSale;
    case "cryptopunks-punk-bought":
      return cryptoPunks.punkBought;
    case "cryptopunks-punk-transfer":
      return cryptoPunks.punkTransfer;
    case "cryptopunks-assign":
      return cryptoPunks.assign;
    case "cryptopunks-transfer":
      return cryptoPunks.transfer;
    case "sudoswap-buy":
      return sudoswap.buy;
    case "sudoswap-sell":
      return sudoswap.sell;
    case "sudoswap-token-deposit":
      return sudoswap.tokenDeposit;
    case "sudoswap-token-withdrawal":
      return sudoswap.tokenWithdrawal;
    case "sudoswap-spot-price-update":
      return sudoswap.spotPriceUpdate;
    case "sudoswap-delta-update":
      return sudoswap.deltaUpdate;
    case "sudoswap-new-pair":
      return sudoswap.newPair;
    case "universe-match":
      return universe.match;
    case "universe-cancel":
      return universe.cancel;
    case "nftx-minted":
      return nftx.minted;
    case "nftx-redeemed":
      return nftx.redeemed;
    case "blur-orders-matched":
      return blur.ordersMatched;
    case "blur-order-cancelled":
      return blur.orderCancelled;
    case "blur-nonce-incremented":
      return blur.nonceIncremented;
    case "forward-order-filled":
      return forward.orderFilled;
    case "forward-order-cancelled":
      return forward.orderCancelled;
    case "forward-counter-incremented":
      return forward.counterIncremented;
    case "manifold-cancel":
      return manifold.cancel;
    case "manifold-finalize":
      return manifold.finalize;
    case "manifold-purchase":
      return manifold.purchase;
    case "manifold-modify":
      return manifold.modify;
    case "tofu-inventory-update":
      return tofu.inventoryUpdate;
    case "decentraland-sale":
      return decentraland.sale;
    case "nft-trader-swap":
      return nftTrader.swap;
    case "okex-order-filled":
      return okex.orderFulfilled;
    case "bend-dao-taker-ask":
      return bendDao.takerAsk;
    case "bend-dao-taker-bid":
      return bendDao.takerBid;

    default:
      return undefined;
  }
};
