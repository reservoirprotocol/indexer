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
  supportedExchanges,
} from "@/events-sync/handlers/royalties/config";
import { getFillEventsFromTxOnChain } from "@/events-sync/handlers/royalties/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { TransactionTrace } from "@/models/transaction-traces";
import { Royalty, getRoyalties } from "@/utils/royalties";

const findMatchingPayment = (payments: Payment[], fillEvent: PartialFillEvent) =>
  payments.find((payment) => paymentMatches(payment, fillEvent));

const paymentMatches = (payment: Payment, fillEvent: PartialFillEvent) => {
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

  // Should only be used for testing
  if (forceOnChain) {
    fillEvents = (await getFillEventsFromTxOnChain(txHash)).fillEvents;
  }

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

  const exchangeAddress = supportedExchanges.get(fillEvent.orderKind);
  if (exchangeAddress) {
    // If the fill event is from a supported exchange then search
    // for any (sub)calls to that particular exchange
    const exchangeCalls = [];
    for (let i = 0; i < 20; i++) {
      const exchangeCall = searchForCall(txTrace.calls, { to: exchangeAddress }, i);
      if (exchangeCall) {
        exchangeCalls.push(exchangeCall);
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
      for (const exchangeCall of exchangeCalls) {
        // Get all payments associated to the call
        const payments = getPayments(exchangeCall);
        const matchingPayment = findMatchingPayment(payments, fillEvent);
        if (matchingPayment) {
          // If we found a matching payment, then we pin-pointed the (sub)call to analyze
          subcallToAnalyze = exchangeCall;
          break;
        }
      }
    }
  }

  // Extract the payments from the (sub)call we just found
  const paymentsToAnalyze = getPayments(subcallToAnalyze);

  // Extract any fill events that have the same contract and currency
  const sameContractFills = fillEvents.filter((e) => {
    const isMatch = e.contract === contract && e.currency === fillEvent.currency;
    const payment = findMatchingPayment(paymentsToAnalyze, e);
    return isMatch && payment;
  });
  // Compute total price for all above same-contract fills
  const sameContractTotalPrice = sameContractFills.reduce(
    (total, item) => total.add(bn(item.price).mul(bn(item.amount))),
    bn(0)
  );

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
    (total, item) => total.add(bn(item.event.price).mul(bn(item.event.amount))),
    bn(0)
  );

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

  const matchDefinition = fillEventsWithRoyaltyData.find(
    (_) => _.contract === contract && _.tokenId === tokenId && _.royalties
  );
  const royalties = matchDefinition ? matchDefinition.royalties : [];

  const royaltyRecipients: string[] = royalties
    .map((r) => r.map(({ recipient }) => recipient))
    .flat();

  // Some addresses we know for sure cannot be royalty recipients
  const notRoyaltyRecipients = new Set();
  notRoyaltyRecipients.add(Sdk.Common.Addresses.Weth[config.chainId]);
  notRoyaltyRecipients.add(Sdk.Common.Addresses.Eth[config.chainId]);
  notRoyaltyRecipients.add(Sdk.BendDao.Addresses.BendWETH[config.chainId]);
  fillEvents.forEach((fillEvent) => {
    notRoyaltyRecipients.add(fillEvent.maker);
    notRoyaltyRecipients.add(fillEvent.taker);
  });

  // Get the know platform fee recipients for the current fill order kind
  const knownPlatformFeeRecipients = platformFeeRecipientsRegistry.get(fillEvent.orderKind) ?? [];

  // Iterate through all of the state changes of the (sub)call associated to the current fill event
  const state = getStateChange(subcallToAnalyze);
  for (const address in state) {
    const { tokenBalanceState } = state[address];

    const ETH = Sdk.Common.Addresses.Eth[config.chainId];
    const BETH = Sdk.Blur.Addresses.Beth[config.chainId];

    const balanceChange =
      currency === ETH
        ? // The fill event will map any BETH fills to ETH so we need to cover that here
          tokenBalanceState[`native:${ETH}`] || tokenBalanceState[`erc20:${BETH}`]
        : tokenBalanceState[`erc20:${currency}`];

    // If the balance change is positive that means a payment was received
    if (balanceChange && !balanceChange.startsWith("-")) {
      const bpsOfPrice = bn(balanceChange).mul(10000).div(bn(price));

      // Start with the assumption that this is a royalty/platform fee payment
      const royalty = {
        recipient: address,
        bps: bpsOfPrice.toNumber(),
      };

      if (knownPlatformFeeRecipients.includes(address)) {
        // This is a marketplace fee payment

        // Reset the bps
        royalty.bps = bn(balanceChange).mul(10000).div(sameProtocolTotalPrice).toNumber();

        marketplaceFeeBreakdown.push(royalty);
      } else {
        // For different collection with same fee recipient
        const shareSameRecepient =
          sameProtocolDetails.filter((d) => d.recipient === address).length ===
          sameProtocolFills.length;

        let bps: number;
        if (shareSameRecepient) {
          bps = bn(balanceChange).mul(10000).div(sameProtocolTotalPrice).toNumber();
        } else {
          bps = bn(balanceChange).mul(10000).div(sameContractTotalPrice).toNumber();
        }

        if (royaltyRecipients.includes(address)) {
          // Reset the bps
          royalty.bps = bps;
          creatorRoyaltyFeeBreakdown.push(royalty);
        }

        // Conditions:
        // - royalty percentage between 0% and 30% (both exclusive)
        // - royalty recipient is not a known platform fee recipient
        // - royalty recipient is a valid royalty recipient
        const recipientIsEligible =
          bps > 0 &&
          bps < 3000 &&
          !allPlatformFeeRecipients.has(address) &&
          !notRoyaltyRecipients.has(address);

        // For now we exclude AMMs which don't pay royalties
        const isAMM = ["sudoswap", "nftx"].includes(fillEvent.orderKind);
        if (recipientIsEligible && !isAMM) {
          // Reset the bps
          royalty.bps = bps;
          royaltyFeeBreakdown.push(royalty);
        }
      }
    }
  }

  const getTotalRoyaltyBps = (royalties: Royalty[]) =>
    royalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);

  const creatorRoyaltyFeeBps = getTotalRoyaltyBps(creatorRoyaltyFeeBreakdown);
  const royaltyFeeBps = getTotalRoyaltyBps(royaltyFeeBreakdown);
  const creatorBps = Math.min(...royalties.map(getTotalRoyaltyBps));

  const paidFullRoyalty = creatorRoyaltyFeeBps >= creatorBps;

  return {
    royaltyFeeBps,
    marketplaceFeeBps: getTotalRoyaltyBps(marketplaceFeeBreakdown),
    royaltyFeeBreakdown,
    marketplaceFeeBreakdown,
    paidFullRoyalty,
  };
}
