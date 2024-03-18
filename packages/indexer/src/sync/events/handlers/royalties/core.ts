import { getStateChange, getPayments, searchForCall } from "@georgeroman/evm-tx-simulator";
import { Payment, CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";

import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import {
  PartialFillEvent,
  StateCache,
  getFillEventsFromTx,
  getOrderInfos,
} from "@/events-sync/handlers/royalties";
import { extractOrdersFromCalldata } from "@/events-sync/handlers/royalties/calldata";
import { supportedExchanges } from "@/events-sync/handlers/royalties/config";
import { splitPayments } from "@/events-sync/handlers/royalties/payments";
import { getFillEventsFromTxOnChain } from "@/events-sync/handlers/royalties/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { FeeRecipients } from "@/models/fee-recipients";
import { TransactionTrace } from "@/models/transaction-traces";
import { Royalty, getRoyalties } from "@/utils/royalties";

const findMatchingPayment = (payments: Payment[], fillEvent: PartialFillEvent) =>
  payments.find((payment) => paymentMatches(payment, fillEvent));

const isNFTPayment = (item: Payment) =>
  item.token.includes("erc1155") || item.token.includes("erc721");

const isTokenPayment = (item: Payment) =>
  item.token.includes("native") || item.token.includes("erc20");

const isSamePayment = (a: Payment, b: Payment) =>
  a.token === b.token && a.from === b.from && a.to === b.to && a.amount === b.amount;

const checkCallIsInParent = (parentCall: CallTrace, subCall: CallTrace) => {
  const globalPayments = getPayments(parentCall);
  const subcallPayments = getPayments(subCall);

  const nftTransfers = subcallPayments.filter(isNFTPayment);
  const tokenTransfers = subcallPayments.filter(isTokenPayment);

  const globalNftTransfers = globalPayments.filter(isNFTPayment);
  const globalTokenTransfers = globalPayments.filter(isTokenPayment);

  const nftTransferAllInParent = nftTransfers.every((item) =>
    globalNftTransfers.find((c) => isSamePayment(item, c))
  );
  const tokenTransferAllInParent = tokenTransfers.every((item) =>
    globalTokenTransfers.find((c) => isSamePayment(item, c))
  );

  return {
    isMatch: nftTransferAllInParent && tokenTransferAllInParent,
    parentTransfers: globalTokenTransfers.filter(
      (item) => !tokenTransfers.find((c) => isSamePayment(item, c))
    ),
  };
};

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

  // Fetch the current transaction's sales
  let fillEvents: PartialFillEvent[] | undefined;
  const cacheKeyEvents = `get-fill-events-from-tx-v2:${txHash}`;
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

  const feeRecipient = await FeeRecipients.getInstance();

  // Extract the orders associated to the current fill events
  const orderIds: string[] = [];
  fillEvents.forEach((c) => {
    if (c.orderId && !cache.orderInfos.get(c.orderId)) {
      orderIds.push(c.orderId);
    }
  });

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
        royalties: royalties.filter((c) => c != undefined),
      };
    })
  );

  // The (sub)call where the current fill occured
  let subcallToAnalyze = txTrace.calls;
  const globalState = getStateChange(txTrace.calls);
  const routerCall = searchForCall(
    txTrace.calls,
    {
      // Reservoir Router
      sigHashes: [
        // execute
        "0x760f2a0b",
        // bulkTransferWithExecute
        "0x74afcbe6",
      ],
    },
    0
  );

  const routerExecutionCalls = [];
  if (routerCall) {
    const transaction = await utils.fetchTransaction(txHash);

    const sdkRouter = new Sdk.RouterV6.Router(config.chainId, baseProvider);
    const executions = sdkRouter.parseExecutions(transaction.data);
    if (executions.length) {
      const executionsByModule = _.groupBy(
        executions,
        (execution) => `${execution.sighash}:${execution.module}`
      );

      for (const moduleAndSignHash of Object.keys(executionsByModule)) {
        const moduleExecutions = executionsByModule[moduleAndSignHash];
        for (let index = 0; index < moduleExecutions.length; index++) {
          const execution = moduleExecutions[index];
          const _executionCall = searchForCall(
            txTrace.calls,
            {
              sigHashes: [execution.sighash],
            },
            index
          );

          if (_executionCall) {
            routerExecutionCalls.push({
              execution,
              call: _executionCall,
            });
          }
        }
      }
    }
  }

  const exchangeAddress = supportedExchanges.get(fillEvent.orderKind);
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

  let parentCallTransfers: Payment[] = [];
  if (routerCall) {
    // Pin-point to the parent module call
    for (const { call } of routerExecutionCalls) {
      const checkResult = checkCallIsInParent(call, subcallToAnalyze);
      if (checkResult.isMatch) {
        parentCallTransfers = checkResult.parentTransfers;
        subcallToAnalyze = call;
      }
    }
  }

  // Extract the payments from the (sub)call we just found
  const paymentsToAnalyze = getPayments(subcallToAnalyze);

  // Get the total number of sales in the current (sub)call
  const nftTransfers = paymentsToAnalyze.reduce((total, item) => {
    const isNFT = item.token.includes("erc1155") || item.token.includes("erc721");
    return total + (isNFT ? 1 : 0);
  }, 0);

  // Sale was executed via the router, but it only has 1 sale in the (sub)call
  const isSingleSaleViaRouter = routerCall && nftTransfers === 1;

  // Extract the orders from calldata when there have multiple fill events
  const parsedOrders =
    fillEvents.length > 1 ? await extractOrdersFromCalldata(subcallToAnalyze.input) : [];

  const linkedOrder = parsedOrders.find(
    (c) => c.contract === fillEvent.contract && c.tokenId === fillEvent.tokenId
  );

  // Extract any fill events that have the same contract and currency
  const sameContractFills = fillEvents.filter((e) => {
    const isMatch = e.contract === contract && e.currency === fillEvent.currency;
    const payment = findMatchingPayment(paymentsToAnalyze, e);
    return isMatch && payment;
  });

  // Compute total price for all above same-contract fills
  const sameContractTotalPrice = sameContractFills.reduce(
    (total, item) => total.add(bn(item.currencyPrice ?? item.price).mul(bn(item.amount))),
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
    (total, item) =>
      total.add(bn(item.event.currencyPrice ?? item.event.price).mul(bn(item.event.amount))),
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

  // Some addresses we know for sure cannot be royalty recipients
  const notRoyaltyRecipients = new Set();
  // Common addresses
  notRoyaltyRecipients.add(Sdk.Common.Addresses.WNative[config.chainId]);
  notRoyaltyRecipients.add(Sdk.Common.Addresses.Native[config.chainId]);
  notRoyaltyRecipients.add(Sdk.BendDao.Addresses.BendWETH[config.chainId]);
  // Misc addresses
  // (BendDAO suspicious liquidator)
  notRoyaltyRecipients.add("0x0b292a7748e52c89f93e66482026c92a335e0d41");

  fillEvents.forEach((fillEvent) => {
    const makerInParcentCall = parentCallTransfers.find(
      (c) => c.from.toLowerCase() === fillEvent.maker || c.to.toLowerCase() === fillEvent.maker
    );
    const takeInParcentCall = parentCallTransfers.find(
      (c) => c.from.toLowerCase() === fillEvent.taker || c.to.toLowerCase() === fillEvent.taker
    );
    if (!makerInParcentCall) {
      notRoyaltyRecipients.add(fillEvent.maker);
    }
    if (!takeInParcentCall) {
      notRoyaltyRecipients.add(fillEvent.taker);
    }
  });

  // Try to split the fill events and their associated payments
  const { chunkedFillEvents, isReliable, hasMultiple } = splitPayments(
    fillEvents,
    paymentsToAnalyze
  );
  const currentFillEvent = chunkedFillEvents.find((c) => c.fillEvent.orderId === fillEvent.orderId);

  const sameContractFillsWithRoyaltyData = fillEventsWithRoyaltyData.filter((c) => {
    return c.contract != contract;
  });

  // Iterate through all of the state changes of the (sub)call associated to the current fill event
  const state = getStateChange(subcallToAnalyze);

  const ETH = Sdk.Common.Addresses.Native[config.chainId];
  const BETH = Sdk.Blur.Addresses.Beth[config.chainId];

  const PRECISION_BASE = 100000;
  const BPS_LIMIT = 15000;

  // Check Paid on top
  for (const address in globalState) {
    const globalChange = globalState[address];
    const exchangeChange = state[address];
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
          const topFeeBps = paidOnTop.gt(0)
            ? paidOnTop.mul(PRECISION_BASE).div(bn(currencyPrice))
            : bn(0);

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

  for (const address in state) {
    const { tokenBalanceState } = state[address];
    const globalChange = globalState[address];

    let balanceChange =
      currency === ETH
        ? // The fill event will map any BETH fills to ETH so we need to cover that here
          tokenBalanceState[`native:${ETH}`] || tokenBalanceState[`erc20:${BETH}`]
        : tokenBalanceState[`erc20:${currency}`];

    try {
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
          const topFeeBps = paidOnTop.gt(0)
            ? paidOnTop.mul(PRECISION_BASE).div(bn(currencyPrice))
            : bn(0);

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

    const multipleTransfers = paymentsToAnalyze.filter(
      (c) => c.to === address && c.token === `native:${ETH}`
    );

    // If there have multiple transfers to the same address
    if (multipleTransfers.length > 1) {
      const totalAmount = multipleTransfers.reduce(
        (total, item) => total.add(bn(item.amount)),
        bn(0)
      );
      const sortedTransfers = multipleTransfers.sort((c, b) =>
        bn(c.amount).gte(bn(b.amount)) ? -1 : 1
      );

      const otherAmount = sortedTransfers
        .slice(1)
        .reduce((total, item) => total.add(bn(item.amount)), bn(0));

      const otherBps = otherAmount.mul(PRECISION_BASE).div(fillEvent.price).toNumber();

      // If totalAmount match with sale price then fix the balanceChange by exclude the largest one
      if (totalAmount.eq(fillEvent.price) && otherBps < BPS_LIMIT) {
        balanceChange = otherAmount.toString();
      }
    }

    // If the balance change is positive that means a payment was received
    if (balanceChange && !balanceChange.startsWith("-")) {
      const bpsOfPrice = bn(balanceChange).mul(PRECISION_BASE).div(bn(currencyPrice));
      // Start with the assumption that this is a royalty/platform fee payment
      const royalty = {
        recipient: address,
        bps: bpsOfPrice.toNumber(),
      };

      const feeRecipientPlatform = feeRecipient.getByAddress(address, "marketplace");
      if (feeRecipientPlatform) {
        // Make sure current fee address in every order
        let protocolFeeSum = sameProtocolTotalPrice;
        if (linkedOrder) {
          protocolFeeSum = sameProtocolFills.reduce((total, item) => {
            const matchOrder = parsedOrders.find(
              (c) => c.contract === item.event.contract && c.tokenId === item.event.tokenId
            );
            if (
              matchOrder &&
              matchOrder.fees.find((c) => c.recipient.toLowerCase() === address.toLowerCase())
            ) {
              return total.add(
                bn(item.event.currencyPrice ?? item.event.price).mul(bn(item.event.amount))
              );
            } else {
              return total;
            }
          }, bn(0));
        }

        // This is a marketplace fee payment
        // Reset the bps
        royalty.bps = bn(balanceChange).mul(PRECISION_BASE).div(protocolFeeSum).toNumber();

        // Calculate by matched payment amount in split payments
        if (matchRangePayment && isReliable && hasMultiple) {
          royalty.bps = bn(matchRangePayment.amount)
            .mul(PRECISION_BASE)
            .div(fillEvent.currencyPrice ?? fillEvent.price)
            .toNumber();
        }

        marketplaceFeeBreakdown.push(royalty);
      } else {
        // For different collection with same fee recipient
        const sameRecipientDetails = sameProtocolDetails.filter((d) => d.recipient === address);
        const shareSameRecipient = sameRecipientDetails.length === sameProtocolFills.length;

        // Make sure current fee address in every order
        let bps: number = bn(balanceChange)
          .mul(PRECISION_BASE)
          .div(sameContractTotalPrice)
          .toNumber();

        // Simple case where there is a single sale via the router
        if (isSingleSaleViaRouter) {
          bps = royalty.bps;
        }

        if (shareSameRecipient) {
          const configBPS = sameRecipientDetails[0].bps;
          const newBps = bn(balanceChange)
            .mul(PRECISION_BASE)
            .div(sameProtocolTotalPrice)
            .toNumber();
          // Make sure the bps is same with the config
          const isValid = configBPS === newBps;
          if (isValid) {
            bps = newBps;
          }
        }

        // Re-calculate the bps based on the fee amount in the order
        if (linkedOrder) {
          const feeItem = linkedOrder.fees.find(
            (c) => c.recipient.toLowerCase() === address.toLowerCase()
          );
          if (feeItem) {
            bps = bn(feeItem.amount)
              .mul(PRECISION_BASE)
              .div(fillEvent.currencyPrice ?? fillEvent.price)
              .toNumber();
          } else {
            // Skip if not the in the fees
            continue;
          }
        }

        // Conditions:
        // - royalty percentage between 0% and 15% (both exclusive)
        // - royalty recipient is not a known platform fee recipient
        // - royalty recipient is a valid royalty recipient
        const notInOtherDef = !sameContractFillsWithRoyaltyData.find((_) =>
          _.royalties.find((c) => c.find((d) => d.recipient === address))
        );

        const excludeOtherRecipients = shareSameRecipient ? true : notInOtherDef;
        const matchFee = feeRecipient.getByAddress(address, "marketplace");

        const inRoyaltyRecipient = royalties.find((c) => c.find((d) => d.recipient === address));

        const recipientIsEligible =
          bps > 0 &&
          bps < BPS_LIMIT &&
          !matchFee &&
          excludeOtherRecipients &&
          (!notRoyaltyRecipients.has(address) || inRoyaltyRecipient);

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

  if (linkedOrder) {
    // In some case the fee recepient is contract and may forward to another address
    // And this will cause it's not in the StateChange we need re-check them if it's in the payments logs
    const missingInStateFees = linkedOrder.fees.filter((c) => !(c.recipient in state));
    if (missingInStateFees.length) {
      for (const missingInStateFee of missingInStateFees) {
        const isInPayment = paymentsToAnalyze.find(
          (c) => c.to === missingInStateFee.recipient && c.amount === missingInStateFee.amount
        );
        if (isInPayment) {
          const royalty = {
            recipient: missingInStateFee.recipient,
            bps: bn(missingInStateFee.amount)
              .mul(PRECISION_BASE)
              .div(fillEvent.currencyPrice ?? fillEvent.price)
              .toNumber(),
          };

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

  const normalizeBps = (c: number) => Math.round(c / 10);
  const normalizeBreakdown = (c: Royalty) => {
    const newBps = normalizeBps(c.bps);
    c.bps = newBps;
    return c;
  };

  const royaltyFeeBpsRaw = getTotalRoyaltyBps(royaltyFeeBreakdown);
  const marketplaceFeeBpsRaw = getTotalRoyaltyBps(marketplaceFeeBreakdown);

  const royaltyFeeBps = normalizeBps(royaltyFeeBpsRaw);
  const marketplaceFeeBps = normalizeBps(marketplaceFeeBpsRaw);

  const creatorBps = Math.min(...royalties.map(getTotalRoyaltyBps));
  const paidFullRoyalty = royaltyFeeBreakdown.length ? royaltyFeeBps >= creatorBps : false;

  royaltyFeeBreakdown.map(normalizeBreakdown);
  marketplaceFeeBreakdown.map(normalizeBreakdown);

  return {
    royaltyFeeOnTop,
    royaltyFeeBps,
    marketplaceFeeBps,
    royaltyFeeBreakdown,
    marketplaceFeeBreakdown,
    paidFullRoyalty,
  };
}
