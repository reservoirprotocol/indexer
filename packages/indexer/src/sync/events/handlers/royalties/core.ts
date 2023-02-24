import { formatEther } from "@ethersproject/units";
import { getStateChange, getPayments, searchForCall } from "@georgeroman/evm-tx-simulator";
import { Payment } from "@georgeroman/evm-tx-simulator/dist/types";
import * as Sdk from "@reservoir0x/sdk";

import { redis } from "@/common/redis";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties";
import {
  platformFeeRecipientsRegistry,
  allPlatformFeeRecipients,
  allExchangeList,
} from "@/events-sync/handlers/royalties/config";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { TransactionTrace } from "@/models/transaction-traces";
import { Royalty, getRoyalties } from "@/utils/royalties";
import { StateCache } from "@/events-sync/handlers/royalties";

function findPayment(payments: Payment[], fillEvent: es.fills.Event) {
  return payments.find((payment) => {
    const matchTokenId = payment.token.includes(`${fillEvent.contract}:${fillEvent.tokenId}`);
    const macthERC20 =
      payment.token.includes(fillEvent.contract) && payment.amount.includes(fillEvent.tokenId);
    return matchTokenId || macthERC20;
  });
}

export async function extractRoyalties(
  fillEvent: es.fills.Event,
  cache: StateCache,
  useCache?: boolean
) {
  const creatorRoyaltyFeeBreakdown: Royalty[] = [];
  const marketplaceFeeBreakdown: Royalty[] = [];
  const royaltyFeeBreakdown: Royalty[] = [];

  const { txHash } = fillEvent.baseEventParams;
  const { tokenId, contract, price, currency } = fillEvent;

  const cacheKeyEvents = `get-fill-events-from-tx:${txHash}`;
  const cacheKeyTrace = `fetch-transaction-trace:${txHash}`;

  let txTrace = null;
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

  let fillEvents = null;
  if (useCache) {
    const result = await redis.get(cacheKeyEvents);
    if (result) {
      fillEvents = JSON.parse(result) as es.fills.Event[];
    }
  }

  if (!fillEvents) {
    const data = await getFillEventsFromTx(txHash);
    fillEvents = data.fillEvents;
    if (useCache) await redis.set(cacheKeyEvents, JSON.stringify(fillEvents), "EX", 10 * 60);
  }

  // Get all related royaltly settings from the same transaction
  const allRoyaltiesDefinition = await Promise.all(
    fillEvents.map(async (_) => {
      const cacheKey = `${_.contract}:${_.tokenId}`;
      let royalties = cache.royalties.get(cacheKey);
      if (!royalties) {
        royalties = await getRoyalties(_.contract, _.tokenId);
        cache.royalties.set(cacheKey, royalties);
      }
      return {
        ..._,
        royalties,
      };
    })
  );

  const otherRoyaltiesDefinition = allRoyaltiesDefinition.filter((c) => {
    return c.contract != contract && c.tokenId != tokenId;
  });

  let traceToAnalyze = txTrace.calls;
  let usingExhcnageCall = false;

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
      usingExhcnageCall = true;
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
          usingExhcnageCall = true;
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

  const tracePayments = getPayments(traceToAnalyze);

  // When the bound is limited, need filter all related collection and protocol fillEvents
  // 1. We could using the NFT's transfer logs to get realeted fillEvents
  const collectionFills =
    fillEvents?.filter((currentEvent) => {
      const macthSameCollection =
        currentEvent.contract === contract && currentEvent.currency === fillEvent.currency;
      if (usingExhcnageCall) {
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
      if (usingExhcnageCall) {
        const matchPayment = findPayment(tracePayments, currentEvent);
        return matchOrderKind && matchPayment;
      } else {
        return matchOrderKind;
      }
    }) || [];

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

  const matchDefinition = allRoyaltiesDefinition.find(
    (_) => _.contract === contract && _.tokenId === tokenId
  );
  const royalties = matchDefinition ? matchDefinition.royalties : [];

  const balanceChangeWithBps = [];
  const royaltyRecipients: string[] = royalties.map((_) => _.recipient);

  // BPS < 30%
  const threshold = 3000;
  let sameCollectionSales = 0;
  let totalTransfers = 0;

  // Tracking same collection sales
  for (const address in state) {
    const { tokenBalanceState } = state[address];
    for (const stateId in tokenBalanceState) {
      const changeValue = tokenBalanceState[stateId];
      const nftTransfer = stateId.startsWith(`erc721:`) || stateId.startsWith(`erc1155:`);
      const isNFTState =
        stateId.startsWith(`erc721:${contract}`) || stateId.startsWith(`erc1155:${contract}`);
      const notIncrease = changeValue.startsWith("-");
      if (isNFTState && !notIncrease) {
        sameCollectionSales++;
      }
      if (nftTransfer && !notIncrease) {
        totalTransfers++;
      }
    }
  }

  const platformFeeRecipients: string[] =
    platformFeeRecipientsRegistry.get(fillEvent.orderKind) ?? [];

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
        const bps = bn(balanceChange).mul(10000).div(collectionRelatedAmount).toNumber();
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

        const notInOtherDef = !otherRoyaltiesDefinition.find((_) =>
          _.royalties.find((c) => c.recipient === address)
        );

        if (isEligible && notInOtherDef) {
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

  const result = {
    txHash,
    sale: {
      tokenId,
      contract,
      currency,
      amount: fillEvent.amount,
      orderKind: fillEvent.orderKind,
      price: formatEther(price),
    },
    totalTransfers,
    royaltyFeeBps,
    marketplaceFeeBps: getTotalRoyaltyBps(marketplaceFeeBreakdown),
    royaltyFeeBreakdown,
    marketplaceFeeBreakdown,
    sameCollectionSales,
    protocolFillEvents: protocolFillEvents.length,
    totalFills: fillEvents.length,
    paidFullRoyalty,
  };

  return result;
}
