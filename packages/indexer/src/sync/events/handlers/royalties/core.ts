import { getStateChange, getPayments, searchForCall } from "@georgeroman/evm-tx-simulator";
import { Payment } from "@georgeroman/evm-tx-simulator/dist/types";
import * as Sdk from "@reservoir0x/sdk";

import { redis } from "@/common/redis";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import {
  PartialFillEvent,
  StateCache,
  getFillEventsFromTx,
} from "@/events-sync/handlers/royalties";
import {
  platformFeeRecipientsRegistry,
  allPlatformFeeRecipients,
  allExchangeList,
} from "@/events-sync/handlers/royalties/config";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { TransactionTrace } from "@/models/transaction-traces";
import { Royalty, getRoyalties } from "@/utils/royalties";
import { getFillEventsFromTxOnChain } from "./utils";

function findPayment(payments: Payment[], fillEvent: PartialFillEvent) {
  return payments.find((payment) => paymentIsMatch(payment, fillEvent));
}

function paymentIsMatch(payment: Payment, fillEvent: PartialFillEvent) {
  const matchTokenId = payment.token.includes(`${fillEvent.contract}:${fillEvent.tokenId}`);
  const macthERC20 =
    payment.token.includes(fillEvent.contract) && payment.amount.includes(fillEvent.tokenId);
  return matchTokenId || macthERC20;
}

export async function extractRoyalties(
  fillEvent: es.fills.Event,
  cache: StateCache,
  useCache?: boolean,
  forceOnChain?: boolean
) {
  const creatorRoyaltyFeeBreakdown: Royalty[] = [];
  const marketplaceFeeBreakdown: Royalty[] = [];
  const royaltyFeeBreakdown: Royalty[] = [];

  const { txHash } = fillEvent.baseEventParams;
  const { tokenId, contract, price, currency } = fillEvent;

  // Fetch the current transaction's trace
  let txTrace: TransactionTrace | undefined;
  const cacheKeyTrace = `fetch-transaction-trace:${txHash}`;
  if (useCache) {
    const result = await redis.get(cacheKeyTrace);
    if (result) {
      txTrace = JSON.parse(result) as TransactionTrace;
    }
  }
  if (!txTrace) {
    txTrace = await utils.fetchTransactionTrace(txHash);
    if (useCache) {
      await redis.set(cacheKeyTrace, JSON.stringify(txTrace), "EX", 10 * 60);
    }
  }
  if (!txTrace) {
    return null;
  }

  // Fetch the current transaction's sales
  let fillEvents: PartialFillEvent[] | undefined;
  const cacheKeyEvents = `get-fill-events-from-tx:${txHash}`;
  if (useCache) {
    const result = await redis.get(cacheKeyEvents);
    if (result) {
      fillEvents = JSON.parse(result) as PartialFillEvent[];
    }
  }

  if (!fillEvents) {
    fillEvents = await getFillEventsFromTx(txHash);
    if (useCache) {
      await redis.set(cacheKeyEvents, JSON.stringify(fillEvents), "EX", 10 * 60);
    }
  }

  // Fallback
  if (forceOnChain) {
    fillEvents = (await getFillEventsFromTxOnChain(txHash)).fillEvents;
  }

  // Get all related royaltly settings from the same transaction
  const allRoyaltiesDefinition = await Promise.all(
    fillEvents.map(async (f) => {
      const cacheKey = `${f.contract}:${f.tokenId}`;
      let royalties = cache.royalties.get(cacheKey);
      if (!royalties) {
        royalties = await getRoyalties(f.contract, f.tokenId);
        cache.royalties.set(cacheKey, royalties);
      }
      return {
        ...f,
        royalties,
      };
    })
  );

  let traceToAnalyze = txTrace.calls;
  let usingExchangeCall = false;

  const exchangeAddress = allExchangeList.get(fillEvent.orderKind);
  if (exchangeAddress) {
    // Get all `orderKind` related exchange's calls
    const allExchangeCalls = [];
    for (let index = 0; index < 100; index++) {
      const exchangeCall = searchForCall(
        txTrace.calls,
        {
          to: exchangeAddress,
        },
        index
      );
      if (exchangeCall) {
        allExchangeCalls.push(exchangeCall);
      } else {
        break;
      }
    }

    if (allExchangeCalls.length === 1) {
      traceToAnalyze = allExchangeCalls[0];
      usingExchangeCall = true;
    } else {
      // If there has multiple exchange calls, we need based on payments
      // to find the related with current `fillEvent` one.
      // What If the same token sale multiple times in different calls?
      for (let index = 0; index < allExchangeCalls.length; index++) {
        const exchangeCall = allExchangeCalls[index];
        const payments = getPayments(exchangeCall);
        const matchPayment = findPayment(payments, fillEvent);
        if (matchPayment) {
          // Found token transfers inside this exchange call
          traceToAnalyze = exchangeCall;
          usingExchangeCall = true;
          break;
        }
      }
    }
  }

  // Exclude same traders from same tx and WETH
  const shouldExcludeAddressList = new Set();

  fillEvents.forEach((fillEvent) => {
    shouldExcludeAddressList.add(fillEvent.maker);
    shouldExcludeAddressList.add(fillEvent.taker);
  });

  shouldExcludeAddressList.add(Sdk.Common.Addresses.Weth[config.chainId]);
  shouldExcludeAddressList.add(Sdk.Common.Addresses.Eth[config.chainId]);
  shouldExcludeAddressList.add(Sdk.BendDao.Addresses.BendWETH[config.chainId]);

  const tracePayments = getPayments(traceToAnalyze);

  // When the bound is limited, need filter all related collection and protocol fillEvents
  // 1. We could using the NFT's transfer logs to get realeted fillEvents
  const collectionFills =
    fillEvents?.filter((currentEvent) => {
      const macthSameCollection =
        currentEvent.contract === contract && currentEvent.currency === fillEvent.currency;
      if (usingExchangeCall) {
        const matchData = findPayment(tracePayments, currentEvent);
        return macthSameCollection && matchData;
      } else {
        return macthSameCollection;
      }
    }) || [];

  const protocolFillEvents =
    fillEvents?.filter((currentEvent) => {
      const matchOrderKind =
        currentEvent.orderKind === fillEvent.orderKind &&
        currentEvent.currency === fillEvent.currency;
      if (usingExchangeCall) {
        const matchPayment = findPayment(tracePayments, currentEvent);
        return matchOrderKind && matchPayment;
      } else {
        return matchOrderKind;
      }
    }) || [];

  const platformFeeRecipients: string[] =
    platformFeeRecipientsRegistry.get(fillEvent.orderKind) ?? [];

  // Split by platform fee
  const chunkedPayments: Payment[][] = [[]];
  const protocolFillEventsByOrder = protocolFillEvents
    .map((event) => {
      return {
        event,
        index: tracePayments.findIndex((c) => paymentIsMatch(c, event)),
      };
    })
    .sort((a, b) => a.index - b.index);

  const usingDelimitByFee = false;

  // if (protocolFillEvents.length > 1 && ["seaport", "seaport-v1.4"].includes(fillEvent.orderKind)) {
  //   tracePayments.reduce((total, item) => {
  //     if (platformFeeRecipients.includes(item.to)) {
  //       total.push([]);
  //     }
  //     total[total.length - 1].push(item);
  //     return total;
  //   }, chunkedPayments);
  //   usingDelimitByFee = true;
  // }

  const protocolFillEventsWithPayments = protocolFillEventsByOrder.map((item, index) => {
    return {
      ...item,
      payments: chunkedPayments[index],
    };
  });

  const currentFillEventWithPayments = protocolFillEventsWithPayments.find(
    (c) =>
      c.event.tokenId === fillEvent.tokenId &&
      c.event.contract === fillEvent.contract &&
      c.event.price === fillEvent.price
  );

  // For same token only count once
  const idTrackers = new Set();
  const protocolRelatedAmount = protocolFillEvents
    ? protocolFillEvents.reduce((total, item) => {
        const id = `${item.contract}:${item.tokenId}`;
        if (idTrackers.has(id)) {
          return total;
        } else {
          return total.add(bn(item.price).mul(bn(item.amount)));
        }
      }, bn(0))
    : bn(0);

  // For same token only count once
  const collectionIdTrackers = new Set();
  const collectionRelatedAmount = collectionFills.reduce((total, item) => {
    const id = `${item.contract}:${item.tokenId}`;
    if (collectionIdTrackers.has(id)) {
      return total;
    } else {
      return total.add(bn(item.price).mul(bn(item.amount)));
    }
  }, bn(0));

  const state = getStateChange(traceToAnalyze);

  // Flatten by recipient
  const recipientRelatedDefinitions: {
    recipient: string;
    bps: number;
    contract: string;
    tokenId: string;
  }[] = [];

  allRoyaltiesDefinition.reduce((all, config) => {
    if (config.royalties) {
      config.royalties.forEach(({ recipient, bps }) => {
        const inSameCall = protocolFillEvents.find(
          (c) => c.contract === config.contract && c.tokenId === config.tokenId
        );
        if (inSameCall) {
          all.push({
            recipient,
            bps,
            contract: config.contract,
            tokenId: config.tokenId,
          });
        }
      });
    }
    return all;
  }, recipientRelatedDefinitions);

  const matchDefinition = allRoyaltiesDefinition.find(
    (_) => _.contract === contract && _.tokenId === tokenId && _.royalties
  );
  const royalties = matchDefinition ? matchDefinition.royalties : [];

  const balanceChangeWithBps = [];
  const royaltyRecipients: string[] = royalties.map((_) => _.recipient);

  // BPS < 30%
  const threshold = 3000;

  for (const address in state) {
    const { tokenBalanceState } = state[address];

    // TODO Move to the SDK
    const BETH = "0x0000000000a39bb272e79075ade125fd351887ac";
    const native = Sdk.Common.Addresses.Eth[config.chainId];
    const isETH = currency === native;

    const nativeChange = tokenBalanceState[`native:${native}`];

    const balanceChange = isETH
      ? nativeChange || tokenBalanceState[`erc20:${BETH}`]
      : tokenBalanceState[`erc20:${currency}`];

    // Receive ETH
    if (balanceChange && !balanceChange.startsWith("-")) {
      const bpsInPrice = bn(balanceChange).mul(10000).div(bn(price));
      const curRoyalties = {
        recipient: address,
        bps: bpsInPrice.toNumber(),
      };

      if (platformFeeRecipients.includes(address)) {
        curRoyalties.bps = bn(balanceChange).mul(10000).div(protocolRelatedAmount).toNumber();
        marketplaceFeeBreakdown.push(curRoyalties);
      } else {
        // For multiple sales in one tx, we need delimit by fee payment, and
        // only process the related payments address
        if (usingDelimitByFee) {
          const isInsidePayments = currentFillEventWithPayments?.payments.find(
            (c) => c.to == address || c.from == address
          );
          if (!isInsidePayments) {
            // Skip if not in the range of payments
            continue;
          }
        }

        let bps: number;

        // For different collection with same fee recipient
        const shareSameRecepient =
          recipientRelatedDefinitions.filter((c) => c.recipient === address).length ===
          protocolFillEvents.length;

        if (shareSameRecepient) {
          bps = bn(balanceChange).mul(10000).div(protocolRelatedAmount).toNumber();
        } else {
          bps = bn(balanceChange).mul(10000).div(collectionRelatedAmount).toNumber();
        }

        if (royaltyRecipients.includes(address)) {
          // For multiple same collection sales in one tx
          curRoyalties.bps = bps;
          creatorRoyaltyFeeBreakdown.push(curRoyalties);
        }

        const isEligible =
          bps < threshold &&
          bps > 0 &&
          !shouldExcludeAddressList.has(address) &&
          !allPlatformFeeRecipients.has(address);

        const isAMM = ["sudoswap", "nftx"].includes(fillEvent.orderKind);
        if (isEligible && !isAMM) {
          curRoyalties.bps = bps;
          royaltyFeeBreakdown.push(curRoyalties);
        }
      }
      balanceChangeWithBps.push({
        recipient: address,
        balanceChange,
        bps: bpsInPrice.toString(),
      });
    }
  }

  const getTotalRoyaltyBps = (royalties?: Royalty[]) =>
    (royalties || []).map(({ bps }) => bps).reduce((a, b) => a + b, 0);

  const creatorRoyaltyFeeBps = getTotalRoyaltyBps(creatorRoyaltyFeeBreakdown);
  const royaltyFeeBps = getTotalRoyaltyBps(royaltyFeeBreakdown);
  const creatorBps = getTotalRoyaltyBps(royalties);

  const paidFullRoyalty = creatorRoyaltyFeeBps >= creatorBps;

  return {
    royaltyFeeBps,
    marketplaceFeeBps: getTotalRoyaltyBps(marketplaceFeeBreakdown),
    royaltyFeeBreakdown,
    marketplaceFeeBreakdown,
    paidFullRoyalty,
  };
}
