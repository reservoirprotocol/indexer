import { Log } from "@ethersproject/abstract-provider";
import { AddressZero, HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { searchForCall } from "@georgeroman/evm-tx-simulator";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  const orderIdsToSkip = new Set<string>();

  // For each transaction keep track of the orders that were explicitly matched
  const matchedOrderIds: { [txHash: string]: Set<string> } = {};
  for (const { baseEventParams, log } of events.filter(
    ({ subKind }) => subKind === "seaport-v1.4-orders-matched"
  )) {
    const txHash = baseEventParams.txHash;
    if (!matchedOrderIds[txHash]) {
      matchedOrderIds[txHash] = new Set<string>();
    }

    const eventData = getEventData(["seaport-v1.4-orders-matched"])[0];
    const parsedLog = eventData.abi.parseLog(log);
    for (const orderId of parsedLog.args["orderHashes"]) {
      matchedOrderIds[txHash].add(orderId);
    }
  }

  // Handle the events
  let i = 0;
  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "seaport-order-cancelled":
      case "seaport-v1.4-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();

        const orderKind = subKind.startsWith("seaport-v1.4") ? "seaport-v1.4" : "seaport";
        onChainData.cancelEvents.push({
          orderKind,
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `cancelled-${orderId}`,
          id: orderId,
          trigger: {
            kind: "cancel",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
            logIndex: baseEventParams.logIndex,
            batchIndex: baseEventParams.batchIndex,
            blockHash: baseEventParams.blockHash,
          },
        });

        break;
      }

      case "seaport-counter-incremented":
      case "seaport-v1.4-counter-incremented": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["offerer"].toLowerCase();
        const newCounter = parsedLog.args["newCounter"].toString();

        const orderKind = subKind.startsWith("seaport-v1.4") ? "seaport-v1.4" : "seaport";
        onChainData.bulkCancelEvents.push({
          orderKind,
          maker,
          minNonce: newCounter,
          baseEventParams,
        });

        break;
      }

      case "seaport-order-filled":
      case "seaport-v1.4-order-filled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const maker = parsedLog.args["offerer"].toLowerCase();
        let taker = parsedLog.args["recipient"].toLowerCase();
        const offer = parsedLog.args["offer"];
        const consideration = parsedLog.args["consideration"];

        // Skip the order if needed
        if (orderIdsToSkip.has(orderId)) {
          break;
        }

        const orderKind = subKind.startsWith("seaport-v1.4") ? "seaport-v1.4" : "seaport";
        const exchange =
          orderKind === "seaport-v1.4"
            ? new Sdk.SeaportV14.Exchange(config.chainId)
            : new Sdk.Seaport.Exchange(config.chainId);

        const saleInfo = exchange.deriveBasicSale(offer, consideration);
        if (saleInfo) {
          // If the order was explicitly matched, make sure to exclude it if
          // the transaction sender is the order's offerer (since this means
          // that the order was just auxiliary most of the time)
          const matched = matchedOrderIds[baseEventParams.txHash];
          if (matched && matched.has(orderId)) {
            const txSender = await utils
              .fetchTransaction(baseEventParams.txHash)
              .then(({ from }) => from);
            if (maker === txSender) {
              break;
            }
          }

          // Handle: filling via `matchOrders`

          // Order 0: bid
          // Order 1: ask
          if (
            taker === AddressZero &&
            i + 1 < events.length &&
            events[i + 1].baseEventParams.txHash === baseEventParams.txHash &&
            events[i + 1].baseEventParams.logIndex === baseEventParams.logIndex + 1 &&
            events[i + 1].subKind === subKind
          ) {
            const parsedLog2 = eventData.abi.parseLog(events[i + 1].log);
            const offer2 = parsedLog2.args["offer"];
            if (
              offer2.length &&
              offer2[0].itemType === consideration[0].itemType &&
              offer2[0].token === consideration[0].token &&
              offer2[0].identifier.toString() === consideration[0].identifier.toString() &&
              offer2[0].amount.toString() === consideration[0].amount.toString()
            ) {
              taker = parsedLog2.args["offerer"].toLowerCase();
              orderIdsToSkip.add(parsedLog2.args["orderHash"]);
            }
          }

          // Order 0: ask
          // Order 1: bid
          if (
            taker === AddressZero &&
            i - 1 >= 0 &&
            events[i - 1].baseEventParams.txHash === baseEventParams.txHash &&
            events[i - 1].baseEventParams.logIndex === baseEventParams.logIndex - 1 &&
            events[i - 1].subKind === subKind
          ) {
            const parsedLog2 = eventData.abi.parseLog(events[i - 1].log);
            const offer2 = parsedLog2.args["offer"];
            if (
              offer2.length &&
              offer2[0].itemType === consideration[0].itemType &&
              offer2[0].token === consideration[0].token &&
              offer2[0].identifier.toString() === consideration[0].identifier.toString() &&
              offer2[0].amount.toString() === consideration[0].amount.toString()
            ) {
              taker = parsedLog2.args["offerer"].toLowerCase();
              orderIdsToSkip.add(parsedLog2.args["orderHash"]);
            }
          }

          // Handle: attribution
          const attributionData = await utils.extractAttributionData(
            baseEventParams.txHash,
            orderKind,
            { orderId }
          );
          if (attributionData.taker) {
            taker = attributionData.taker;
          }

          if (saleInfo.recipientOverride) {
            taker = saleInfo.recipientOverride;
          }

          // Handle: prices
          const currency = saleInfo.paymentToken;
          const currencyPrice = bn(saleInfo.price).div(saleInfo.amount).toString();
          const priceData = await getUSDAndNativePrices(
            currency,
            currencyPrice,
            baseEventParams.timestamp
          );
          if (!priceData.nativePrice) {
            // We must always have the native price
            break;
          }

          const orderSide = saleInfo.side as "sell" | "buy";
          onChainData.fillEventsPartial.push({
            orderKind,
            orderId,
            orderSide,
            maker,
            taker,
            price: priceData.nativePrice,
            currency,
            currencyPrice,
            usdPrice: priceData.usdPrice,
            contract: saleInfo.contract,
            tokenId: saleInfo.tokenId,
            amount: saleInfo.amount,
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });

          onChainData.fillInfos.push({
            context: `${orderId}-${baseEventParams.txHash}`,
            orderId: orderId,
            orderSide,
            contract: saleInfo.contract,
            tokenId: saleInfo.tokenId,
            amount: saleInfo.amount,
            price: priceData.nativePrice,
            timestamp: baseEventParams.timestamp,
            maker,
            taker,
          });
        }

        onChainData.orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        // If an ERC20 transfer occured in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          onChainData.makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker,
            trigger: {
              kind: "approval-change",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
            data: {
              kind: "buy-approval",
              contract: erc20,
              orderKind,
            },
          });
        }

        break;
      }

      case "seaport-v1.4-order-validated":
      case "seaport-order-validated": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const orderKind = subKind.startsWith("seaport-v1.4") ? "seaport-v1.4" : "seaport";

        const isV14 = orderKind === "seaport-v1.4";
        const exchange = isV14
          ? new Sdk.SeaportV14.Exchange(config.chainId)
          : new Sdk.Seaport.Exchange(config.chainId);

        const allOrderParametersV14 = [];
        const allOrderParameters = [];

        if (isV14) {
          const orderParameters = parsedLog.args["orderParameters"];
          allOrderParametersV14.push(orderParameters);
        } else {
          const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
          if (!txTrace) {
            // Skip any failed attempts to get the trace
            break;
          }

          const validateCalls = [];
          for (let index = 0; index < 100; index++) {
            const matchCall = searchForCall(
              txTrace.calls,
              {
                sigHashes: ["0x88147732"],
              },
              index
            );
            if (matchCall) {
              validateCalls.push(matchCall);
            } else {
              break;
            }
          }

          for (let index = 0; index < validateCalls.length; index++) {
            try {
              const inputData = exchange.contract.interface.decodeFunctionData(
                "validate",
                validateCalls[index].input
              );
              for (let index = 0; index < inputData.orders.length; index++) {
                allOrderParameters.push(inputData.orders[index].parameters);
              }
            } catch {
              // Skip errors
            }
          }
        }

        // Handle seaport
        for (let index = 0; index < allOrderParameters.length; index++) {
          const parameters = allOrderParameters[index];
          try {
            const counter = await exchange.getCounter(baseProvider, parameters.offerer);
            const order = new Sdk.Seaport.Order(config.chainId, {
              ...parameters,
              counter,
            });
            order.params.signature = HashZero;

            if (orderId === order.hash()) {
              onChainData.orders.push({
                kind: "seaport",
                info: {
                  kind: "full",
                  orderParams: order.params,
                  metadata: {
                    fromOnChain: true,
                  },
                },
              });
            }
          } catch {
            // Skip errors
          }
        }

        // Handle seaport-v1.4
        for (let index = 0; index < allOrderParametersV14.length; index++) {
          const parameters = allOrderParametersV14[index];
          try {
            const counter = await exchange.getCounter(baseProvider, parameters.offerer);
            const order = new Sdk.SeaportV14.Order(config.chainId, {
              ...parameters,
              counter,
            });
            order.params.signature = HashZero;

            if (orderId === order.hash()) {
              onChainData.orders.push({
                kind: "seaport-v1.4",
                info: {
                  kind: "full",
                  orderParams: order.params,
                  metadata: {
                    fromOnChain: true,
                  },
                },
              });
            }
          } catch {
            // Skip errors
          }
        }

        break;
      }
    }

    i++;
  }

  // Filter out any sales to get skipped
  onChainData.fillEventsPartial = onChainData.fillEventsPartial.filter(
    ({ orderId }) => !orderIdsToSkip.has(orderId!)
  );
};
