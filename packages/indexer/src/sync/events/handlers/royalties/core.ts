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
  getOrderInfos,
} from "@/events-sync/handlers/royalties";
import {
  platformFeeRecipientsRegistry,
  allPlatformFeeRecipients,
  supportedExchanges,
} from "@/events-sync/handlers/royalties/config";
import { getFillEventsFromTxOnChain } from "@/events-sync/handlers/royalties/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { TransactionTrace } from "@/models/transaction-traces";
import { Royalty, getRoyalties } from "@/utils/royalties";
import { splitPayments } from "./payments";

const findMatchingPayment = (payments: Payment[], fillEvent: PartialFillEvent) =>
  payments.find((payment) => paymentMatches(payment, fillEvent));

export const paymentMatches = (payment: Payment, fillEvent: PartialFillEvent) => {
  // Cover regular ERC721/ERC1155 transfers
  const matchesNFTTransfer = payment.token.includes(`${fillEvent.contract}:${fillEvent.tokenId}`);
  // But also non-standard ERC20 transfers (which some NFTs still use)
  const matchesERC20Transfer =
    payment.token.includes(fillEvent.contract) && payment.amount.includes(fillEvent.tokenId);
  return matchesNFTTransfer || matchesERC20Transfer;
};

export async function extractRoyalties(
  fillEvent: es.fills.Event,
  cache: StateCache,
  useCache?: boolean,
  forceOnChain?: boolean
) {
  const creatorRoyaltyFeeBreakdown: Royalty[] = [];
  const marketplaceFeeBreakdown: Royalty[] = [];
  const royaltyFeeBreakdown: Royalty[] = [];
  const royaltyFeeOnTop: Royalty[] = [];

  const { txHash } = fillEvent.baseEventParams;
  const { tokenId, contract, currency, price } = fillEvent;

  const currencyPrice = fillEvent.currencyPrice ?? price;

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

  //console.log(JSON.stringify(txTrace));

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

  // Should only be used for testing
  if (forceOnChain) {
    fillEvents = (await getFillEventsFromTxOnChain(txHash)).fillEvents;
  }

  // Extract the orders associated to the current fill events
  const orderIds: string[] = [];
  fillEvents.forEach((c) => {
    if (c.orderId && !cache.orderInfos.get(c.orderId)) {
      orderIds.push(c.orderId);
    }
  });
  //console.log(`fillEvents: ${JSON.stringify(fillEvents)}`);

  // Get the infos of the orders associated to the current fill events
  const orderInfos = await getOrderInfos(orderIds);
  orderInfos.forEach((info) => {
    cache.orderInfos.set(info.orderId, info);
  });

  const orderInfo = fillEvent.orderId ? cache.orderInfos.get(fillEvent.orderId) : undefined;

  // For every fill event, get the current royalties (ones cached in our database)
  const fillEventsWithRoyaltyData = await Promise.all(
    fillEvents.map(async (f) => {
      const cacheKey = `${f.contract}:${f.tokenId}`;

      let royalties = cache.royalties.get(cacheKey);
      if (!royalties) {
        royalties = [];

        // Cover both onchain and opensea royalties
        royalties.push(await getRoyalties(f.contract, f.tokenId, "onchain"));
        royalties.push(await getRoyalties(f.contract, f.tokenId, "opensea"));

        cache.royalties.set(cacheKey, royalties);
      }

      return {
        ...f,
        royalties,
      };
    })
  );

  // The (sub)call where the current fill occured
  let subcallToAnalyze = txTrace.calls;
  //console.log(`subcallToAnalyze: ${JSON.stringify(subcallToAnalyze)}`);
  const globalState = getStateChange(txTrace.calls);
  const routerCall = searchForCall(
    txTrace.calls,
    {
      // Reservoir Router
      sigHashes: ["0x760f2a0b"],
    },
    0
  );

  const exchangeAddress = supportedExchanges.get(fillEvent.orderKind);
  //console.log(`exchangeAddress: ${exchangeAddress}`);
  if (exchangeAddress) {
    // If the fill event is from a supported exchange then search
    // for any (sub)calls to that particular exchange
    const exchangeCalls = [];
    for (let i = 0; i < 20; i++) {
      const exchangeCall = searchForCall(txTrace.calls, { to: exchangeAddress }, i);
      if (exchangeCall) {
        const payments = getPayments(exchangeCall);
        // Filter no payments call
        if (payments.length) {
          exchangeCalls.push(exchangeCall);
        }
      }
    }

    if (exchangeCalls.length === 1) {
      // If there is a unique call to the exchange in the current
      // transaction then that is the (sub)call that we will need
      // to further analyze
      subcallToAnalyze = exchangeCalls[0];
    } else {
      // If there are multiple calls to the exchange in the current
      // transaction then we try to look for the (sub)call where we
      // find the current fill event's token
      // TODO: What if the same token sold multiple times in different calls?
      const sameTokenFillEvents = fillEvents.filter(
        (_) => _.contract === fillEvent.contract && _.tokenId === fillEvent.tokenId
      );

      const matchExchangeCalls = [];

      for (const exchangeCall of exchangeCalls) {
        // Get all payments associated to the call
        const payments = getPayments(exchangeCall);
        const matchingPayment = findMatchingPayment(payments, fillEvent);
        if (matchingPayment) {
          matchExchangeCalls.push(exchangeCall);
        }
      }

      // If we found a matching payment, then we pin-pointed the (sub)call to analyze
      if (matchExchangeCalls.length) {
        const eventIndex = sameTokenFillEvents.findIndex(
          (_) =>
            _.contract === fillEvent.contract &&
            _.tokenId === fillEvent.tokenId &&
            _.baseEventParams.logIndex === fillEvent.baseEventParams.logIndex
        );

        if (matchExchangeCalls[eventIndex]) {
          subcallToAnalyze = matchExchangeCalls[eventIndex];
        }
      }
    }
  }

  // Extract the payments from the (sub)call we just found
  const paymentsToAnalyze = getPayments(subcallToAnalyze);
  //console.log(`paymentsToAnalyze: ${JSON.stringify(paymentsToAnalyze[0])}`);

  // Extract any fill events that have the same contract and currency
  const sameContractFills = fillEvents.filter((e) => {
    const isMatch = e.contract === contract && e.currency === fillEvent.currency;
    const payment = findMatchingPayment(paymentsToAnalyze, e);
    return isMatch && payment;
  });
  //console.log(`sameContractFills: ${JSON.stringify(sameContractFills)}`);
  // Compute total price for all above same-contract fills
  const sameContractTotalPrice = sameContractFills.reduce(
    (total, item) => total.add(bn(item.currencyPrice ?? item.price).mul(bn(item.amount))),
    bn(0)
  );
  //console.log(`sameContractTotalPrice: ${JSON.stringify(sameContractTotalPrice)}`);
  // Extract any fill events that have the same order kind and currency
  const sameProtocolFills = fillEvents
    .filter((e) => {
      const isMatch = e.orderKind === fillEvent.orderKind && e.currency === fillEvent.currency;
      const payment = findMatchingPayment(paymentsToAnalyze, e);
      return isMatch && payment;
    })
    .map((event) => {
      return {
        event,
        index: paymentsToAnalyze.findIndex((p) => paymentMatches(p, event)),
      };
    })
    // Make sure to sort
    .sort((a, b) => a.index - b.index);
  // Compute total price for all above same-protocol fills
  const sameProtocolTotalPrice = sameProtocolFills.reduce(
    (total, item) =>
      total.add(bn(item.event.currencyPrice ?? item.event.price).mul(bn(item.event.amount))),
    bn(0)
  );
  //console.log(`sameProtocolFills: ${JSON.stringify(sameProtocolFills)}`);
  //console.log(`sameProtocolTotalPrice: ${JSON.stringify(sameProtocolTotalPrice)}`);

  // Keep track of some details for every same-protocol sale
  const sameProtocolDetails: {
    recipient: string;
    bps: number;
    contract: string;
    tokenId: string;
  }[] = [];
  for (const { contract, tokenId, royalties } of fillEventsWithRoyaltyData) {
    royalties
      .map((r) =>
        r.forEach(({ recipient, bps }) => {
          const foundMatching = sameProtocolFills.find(
            ({ event }) => event.contract === contract && event.tokenId === tokenId
          );
          if (foundMatching) {
            const isExist = sameProtocolDetails.find(
              (c) => c.recipient === recipient && c.contract === contract && c.tokenId === tokenId
            );
            if (!isExist) {
              sameProtocolDetails.push({
                recipient,
                bps,
                contract,
                tokenId,
              });
            }
          }
        })
      )
      .flat();
  }
  //console.log(`sameProtocolDetails: ${JSON.stringify(sameProtocolDetails)}`);
  const matchDefinition = fillEventsWithRoyaltyData.find(
    (_) => _.contract === contract && _.tokenId === tokenId && _.royalties
  );
  //console.log(`matchDefinition: ${JSON.stringify(matchDefinition)}`);
  const royalties = matchDefinition ? matchDefinition.royalties : [];
  //console.log(`royalties: ${JSON.stringify(royalties)}`);
  const royaltyRecipients: string[] = royalties
    .map((r) => r.map(({ recipient }) => recipient))
    .flat();

  // Some addresses we know for sure cannot be royalty recipients
  const notRoyaltyRecipients = new Set();
  // Common addresses
  notRoyaltyRecipients.add(Sdk.Common.Addresses.Weth[config.chainId]);
  notRoyaltyRecipients.add(Sdk.Common.Addresses.Eth[config.chainId]);
  notRoyaltyRecipients.add(Sdk.BendDao.Addresses.BendWETH[config.chainId]);
  // Misc addresses
  // (BendDAO suspicious liquidator)
  notRoyaltyRecipients.add("0x0b292a7748e52c89f93e66482026c92a335e0d41");

  fillEvents.forEach((fillEvent) => {
    notRoyaltyRecipients.add(fillEvent.maker);
    notRoyaltyRecipients.add(fillEvent.taker);
  });

  const payments = paymentsToAnalyze.filter((_) => {
    return !platformFeeRecipientsRegistry.has(_.to);
  });

  // Try to split the fill events and their associated payments
  const { chunkedFillEvents, isReliable, hasMultiple } = splitPayments(fillEvents, payments);
  //console.log(`chunkedFillEvents: ${JSON.stringify(chunkedFillEvents)}`);
  const currentFillEvent = chunkedFillEvents.find((c) => c.fillEvent.orderId === fillEvent.orderId);

  const sameContractFillsWithRoyaltyData = fillEventsWithRoyaltyData.filter((c) => {
    return c.contract != contract;
  });

  // Get the know platform fee recipients for the current fill order kind
  const knownPlatformFeeRecipients = platformFeeRecipientsRegistry.get(fillEvent.orderKind) ?? [];

  // Iterate through all of the state changes of the (sub)call associated to the current fill event
  const state = getStateChange(subcallToAnalyze);

  const ETH = Sdk.Common.Addresses.Eth[config.chainId];
  const BETH = Sdk.Blur.Addresses.Beth[config.chainId];

  // Check Paid on top
  for (const address in globalState) {
    const globalChange = globalState[address];
    // console.log(`globalChange: ${JSON.stringify(globalChange)}`);
    const exchangeChange = state[address];
    // console.log(`exchangeChange: ${JSON.stringify(exchangeChange)}`);
    try {
      if (routerCall && globalChange && fillEvents.length === 1) {
        const { tokenBalanceState } = globalChange;
        const globalBalanceChange =
          currency === ETH
            ? // The fill event will map any BETH fills to ETH so we need to cover that here
              tokenBalanceState[`native:${ETH}`] || tokenBalanceState[`erc20:${BETH}`]
            : tokenBalanceState[`erc20:${currency}`];

        if (globalBalanceChange && !globalBalanceChange.startsWith("-") && !exchangeChange) {
          const paidOnTop = bn(globalBalanceChange);
          const topFeeBps = paidOnTop.gt(0) ? paidOnTop.mul(10000).div(bn(currencyPrice)) : bn(0);

          if (topFeeBps.gt(0)) {
            royaltyFeeOnTop.push({
              recipient: address,
              bps: topFeeBps.toNumber(),
            });
          }
        }
      }
    } catch {
      // Skip errors
    }
  }
  //console.log(`state: ${JSON.stringify(state)}`);
  for (const address in state) {
    //console.log(`address: ${JSON.stringify(address)}`);
    const { tokenBalanceState } = state[address];
    const globalChange = globalState[address];

    const balanceChange =
      currency === ETH
        ? // The fill event will map any BETH fills to ETH so we need to cover that here
          tokenBalanceState[`native:${ETH}`] || tokenBalanceState[`erc20:${BETH}`]
        : tokenBalanceState[`erc20:${currency}`];

    try {
      //console.log(`routercall: ${routerCall}`);
      // Fees on the top, make sure it's a single-sale transaction
      if (routerCall && globalChange && fillEvents.length === 1) {
        const { tokenBalanceState } = globalChange;
        const globalBalanceChange =
          currency === ETH
            ? // The fill event will map any BETH fills to ETH so we need to cover that here
              tokenBalanceState[`native:${ETH}`] || tokenBalanceState[`erc20:${BETH}`]
            : tokenBalanceState[`erc20:${currency}`];

        if (globalBalanceChange && !globalBalanceChange.startsWith("-")) {
          const balanceChangeAmount =
            balanceChange && !balanceChange.startsWith("-") ? bn(balanceChange) : bn(0);
          const paidOnTop = bn(globalBalanceChange).sub(balanceChangeAmount);
          const topFeeBps = paidOnTop.gt(0) ? paidOnTop.mul(10000).div(bn(currencyPrice)) : bn(0);

          if (topFeeBps.gt(0)) {
            royaltyFeeOnTop.push({
              recipient: address,
              bps: topFeeBps.toNumber(),
            });
          }
        }
      }
    } catch {
      // Skip any errors
    }

    // For multiple sales we should check if it in the range of payments
    const matchRangePayment = currentFillEvent?.relatedPayments.find(
      (c) => c.to.toLowerCase() === address.toLowerCase()
    );

    // If the balance change is positive that means a payment was received
    if (balanceChange && !balanceChange.startsWith("-")) {
      //console.log(`balanceChange: ${balanceChange} and currencyPrice: ${currencyPrice}`);
      const bpsOfPrice = bn(balanceChange).mul(10000).div(bn(currencyPrice));
      //console.log(`bpsOfPrice: ${bpsOfPrice}`);
      // Start with the assumption that this is a royalty/platform fee payment
      const royalty = {
        recipient: address,
        bps: bpsOfPrice.toNumber(),
      };

      if (knownPlatformFeeRecipients.includes(address)) {
        // This is a marketplace fee payment
        // Reset the bps
        royalty.bps = bn(balanceChange).mul(10000).div(sameProtocolTotalPrice).toNumber();

        // Calculate by matched payment amount in split payments
        if (matchRangePayment && isReliable && hasMultiple) {
          royalty.bps = bn(matchRangePayment.amount)
            .mul(10000)
            .div(fillEvent.currencyPrice ?? fillEvent.price)
            .toNumber();
        }

        marketplaceFeeBreakdown.push(royalty);
      } else {
        // For different collection with same fee recipient
        const sameRecipientDetails = sameProtocolDetails.filter((d) => d.recipient === address);
        const shareSameRecipient = sameRecipientDetails.length === sameProtocolFills.length;

        let bps: number = bn(balanceChange).mul(10000).div(sameContractTotalPrice).toNumber();

        if (shareSameRecipient) {
          const configBPS = sameRecipientDetails[0].bps;
          const newBps = bn(balanceChange).mul(10000).div(sameProtocolTotalPrice).toNumber();
          // Make sure the bps is same with the config
          const isValid = configBPS === newBps;
          if (isValid) {
            bps = newBps;
          }
        }

        if (royaltyRecipients.includes(address)) {
          // Reset the bps
          royalty.bps = bps;
          creatorRoyaltyFeeBreakdown.push(royalty);
        }

        // Conditions:
        // - royalty percentage between 0% and 15% (both exclusive)
        // - royalty recipient is not a known platform fee recipient
        // - royalty recipient is a valid royalty recipient
        const notInOtherDef = !sameContractFillsWithRoyaltyData.find((_) =>
          _.royalties.find((c) => c.find((d) => d.recipient === address))
        );

        const excludeOtherRecipients = shareSameRecipient ? true : notInOtherDef;
        const recipientIsEligible =
          bps > 0 &&
          bps < 1500 &&
          !allPlatformFeeRecipients.has(address) &&
          excludeOtherRecipients &&
          !notRoyaltyRecipients.has(address);

        // For multiple sales, we should check if the current payment is
        // in the range of payments associated to the current fill event
        let isInRange =
          hasMultiple && !shareSameRecipient
            ? currentFillEvent?.relatedPayments.find(
                (c) => c.to.toLowerCase() === address.toLowerCase()
              )
            : true;

        // Match with the order's fee breakdown
        if (!isInRange) {
          isInRange = Boolean((orderInfo?.feeBreakdown ?? []).find((c) => c.recipient === address));
        }

        // For now we exclude AMMs which don't pay royalties
        const isAMM = ["sudoswap", "nftx"].includes(fillEvent.orderKind);
        if (recipientIsEligible && !isAMM && isInRange) {
          // Reset the bps
          royalty.bps = bps;
          royaltyFeeBreakdown.push(royalty);
        }
      }
    }
  }

  const getTotalRoyaltyBps = (royalties: Royalty[]) =>
    royalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);

  if (royaltyFeeOnTop.length) {
    royaltyFeeOnTop.forEach((c) => {
      const existRoyalty = royaltyFeeBreakdown.find((_) => _.recipient === c.recipient);
      if (!existRoyalty) {
        royaltyFeeBreakdown.push(c);
      } else {
        // sum by same recipient
        existRoyalty.bps = existRoyalty.bps + c.bps;
      }
    });
  }

  const creatorRoyaltyFeeBps = getTotalRoyaltyBps(creatorRoyaltyFeeBreakdown);
  const royaltyFeeBps = getTotalRoyaltyBps(royaltyFeeBreakdown);
  const creatorBps = Math.min(...royalties.map(getTotalRoyaltyBps));

  const paidFullRoyalty = creatorRoyaltyFeeBps >= creatorBps;
  //console.log(`royaltyFeeBps: ${royaltyFeeBps}`);
  //console.log(`royaltyFeeOnTop: ${JSON.stringify(royaltyFeeOnTop)}`);
  return {
    royaltyFeeOnTop,
    royaltyFeeBps,
    marketplaceFeeBps: getTotalRoyaltyBps(marketplaceFeeBreakdown),
    royaltyFeeBreakdown,
    marketplaceFeeBreakdown,
    paidFullRoyalty,
  };
}
