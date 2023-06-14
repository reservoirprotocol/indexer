import { Interface } from "@ethersproject/abi";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Log } from "@ethersproject/providers";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { idb } from "@/common/db";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import { BaseEventParams } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { TransactionTrace } from "@/models/transaction-traces";
import { OrderKind } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Store the txTrace for the current txn so it doesn't have to be re-fetched
  let txTrace: TransactionTrace | undefined;

  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);
    const eventData = getEventData([subKind])[0];
    const parsedLog = eventData.abi.parseLog(log);

    switch (subKind) {
      case "flow-cancel-all-orders": {
        const newMinNonce = parsedLog.args.newMinNonce as BigNumberish;
        const user = parsedLog.args.user.toLowerCase();

        onChainData.bulkCancelEvents.push({
          orderKind: "flow",
          maker: user,
          minNonce: newMinNonce.toString(),
          baseEventParams,
          acrossAll: false,
        });

        break;
      }

      case "flow-cancel-multiple-orders": {
        const nonces = parsedLog.args.orderNonces as BigNumberish[];
        const user = parsedLog.args.user.toLowerCase();

        const cancelEvents: es.nonceCancels.Event[] = nonces.map((nonce, index) => {
          return {
            orderKind: "flow",
            maker: user,
            nonce: nonce.toString(),
            baseEventParams: {
              ...baseEventParams,
              batchIndex: baseEventParams.batchIndex + index,
            },
          };
        });

        onChainData.nonceCancelEvents.push(...cancelEvents);

        break;
      }

      case "flow-match-order-fulfilled": {
        const sellOrderHash = parsedLog.args.sellOrderHash.toLowerCase();
        const buyOrderHash = parsedLog.args.buyOrderHash.toLowerCase();
        const seller = parsedLog.args.seller.toLowerCase();
        const buyer = parsedLog.args.buyer.toLowerCase();
        const currency = parsedLog.args.currency.toLowerCase();
        const currencyPrice = parsedLog.args.amount.toString();
        const nfts = parsedLog.args.nfts as {
          collection: string;
          tokens: {
            tokenId: BigNumberish;
            numTokens: BigNumberish;
          }[];
        }[];
        const orderKind: OrderKind = "flow";

        // Handle: cancel orders with the same nonce
        const sellOrderNonceResult = await getOrderNonce(
          sellOrderHash,
          seller,
          txTrace ?? baseEventParams
        );
        const sellOrderNonce = sellOrderNonceResult.nonce;
        if (sellOrderNonceResult.txTrace) {
          txTrace = sellOrderNonceResult.txTrace;
        }

        const buyOrderNonceResult = await getOrderNonce(
          buyOrderHash,
          buyer,
          txTrace ?? baseEventParams
        );
        const buyOrderNonce = buyOrderNonceResult.nonce;
        if (buyOrderNonceResult.txTrace) {
          txTrace = buyOrderNonceResult.txTrace;
        }

        let nonceCancelEventBatchIndex = baseEventParams.batchIndex;
        if (sellOrderNonce) {
          onChainData.nonceCancelEvents.push({
            orderKind,
            maker: seller,
            nonce: sellOrderNonce,
            baseEventParams: {
              ...baseEventParams,
              batchIndex: nonceCancelEventBatchIndex++,
            },
          });
        }
        if (buyOrderNonce) {
          onChainData.nonceCancelEvents.push({
            orderKind,
            maker: buyer,
            nonce: buyOrderNonce,
            baseEventParams: {
              ...baseEventParams,
              batchIndex: nonceCancelEventBatchIndex++,
            },
          });
        }

        // Handle: attribution
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId: sellOrderHash }
        );

        // Handle: prices
        const numTokens = nfts.reduce((acc, item) => {
          return acc.add(
            item.tokens.reduce(
              (collectionNumTokens, token) => collectionNumTokens.add(token.numTokens),
              bn(0)
            )
          );
        }, bn(0));

        const pricePerToken = bn(currencyPrice).div(numTokens).toString();
        const priceDataPerToken = await getUSDAndNativePrices(
          currency,
          pricePerToken,
          baseEventParams.timestamp
        );
        if (!priceDataPerToken.nativePrice) {
          // We must always have the native price
          break;
        }

        // Don't handle fill events for bundles
        if (nfts.length === 1) {
          const nft = nfts[0];
          if (nft.tokens.length === 1) {
            const token = nft.tokens[0];
            const tokenId = bn(token.tokenId).toString();
            const numTokens = bn(token.numTokens).toString();

            let fillEventBatchIndex = baseEventParams.batchIndex;
            onChainData.fillEvents.push({
              orderKind,
              orderId: sellOrderHash,
              orderSide: "sell",
              maker: seller,
              taker: buyer,
              price: priceDataPerToken.nativePrice,
              currency,
              currencyPrice: pricePerToken,
              usdPrice: priceDataPerToken.usdPrice,
              contract: nft.collection.toLowerCase(),
              tokenId,
              amount: numTokens,
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams: {
                ...baseEventParams,
                batchIndex: fillEventBatchIndex++,
              },
            });
            onChainData.fillEvents.push({
              orderKind,
              orderId: buyOrderHash,
              orderSide: "buy",
              maker: buyer,
              taker: seller,
              price: priceDataPerToken.nativePrice,
              currency,
              currencyPrice: pricePerToken,
              usdPrice: priceDataPerToken.usdPrice,
              contract: nft.collection.toLowerCase(),
              tokenId,
              amount: numTokens,
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams: {
                ...baseEventParams,
                batchIndex: fillEventBatchIndex++,
              },
            });

            onChainData.fillInfos.push({
              context: `${buyOrderHash}-${baseEventParams.txHash}-${nft.collection}-${token.tokenId}`,
              orderId: buyOrderHash,
              orderSide: "buy",
              contract: nft.collection.toLowerCase(),
              tokenId,
              amount: numTokens,
              price: bn(priceDataPerToken.nativePrice).mul(token.numTokens).toString(),
              timestamp: baseEventParams.timestamp,
              maker: buyer,
              taker: seller,
            });

            onChainData.fillInfos.push({
              context: `${sellOrderHash}-${baseEventParams.txHash}-${nft.collection}-${token.tokenId}`,
              orderId: sellOrderHash,
              orderSide: "sell",
              contract: nft.collection.toLowerCase(),
              tokenId,
              amount: numTokens,
              price: bn(priceDataPerToken.nativePrice).mul(token.numTokens).toString(),
              timestamp: baseEventParams.timestamp,
              maker: buyer,
              taker: seller,
            });
          }
        }

        onChainData.orderInfos.push({
          context: `filled-${sellOrderHash}`,
          id: sellOrderHash,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        onChainData.orderInfos.push({
          context: `filled-${buyOrderHash}`,
          id: buyOrderHash,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        // If an ERC20 transfer occurred in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          onChainData.makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker: buyer,
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

      case "flow-take-order-fulfilled": {
        const orderHash = parsedLog.args.orderHash.toLowerCase();
        const seller = parsedLog.args.seller.toLowerCase();
        const buyer = parsedLog.args.buyer.toLowerCase();
        const currency = parsedLog.args.currency.toLowerCase();
        const currencyPrice = parsedLog.args.amount.toString();
        const nfts = parsedLog.args.nfts as {
          collection: string;
          tokens: {
            tokenId: BigNumberish;
            numTokens: BigNumberish;
          }[];
        }[];
        const orderKind: OrderKind = "flow";

        const orderSideResult = await getOrderSide(orderHash, seller, buyer, baseEventParams);
        if (orderSideResult.txTrace) {
          txTrace = orderSideResult.txTrace;
        }

        // Handle: cancel orders
        if (orderSideResult.nonce) {
          onChainData.nonceCancelEvents.push({
            orderKind,
            maker: orderSideResult.maker,
            nonce: orderSideResult.nonce,
            baseEventParams,
          });
        }

        // Handle: attribution
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId: orderHash }
        );

        // Handle: prices
        const numTokens = nfts.reduce((acc, item) => {
          return acc.add(
            item.tokens.reduce(
              (collectionNumTokens: BigNumber, token) =>
                collectionNumTokens.add(bn(token.numTokens)),
              bn(0)
            )
          );
        }, bn(0));

        const pricePerToken = bn(currencyPrice).div(numTokens).toString();
        const priceDataPerToken = await getUSDAndNativePrices(
          currency,
          pricePerToken,
          baseEventParams.timestamp
        );
        if (!priceDataPerToken.nativePrice) {
          // We must always have the native price
          break;
        }

        if (orderSideResult.nonce) {
          const orderSide = orderSideResult.isSellOrder ? "sell" : "buy";
          // Don't handle fills events for bundles
          if (nfts.length === 1) {
            const nft = nfts[0];
            if (nft.tokens.length === 1) {
              const token = nft.tokens[0];
              const tokenId = bn(token.tokenId).toString();
              const numTokens = bn(token.numTokens).toString();

              onChainData.fillEvents.push({
                orderKind,
                orderId: orderHash,
                orderSide,
                maker: orderSideResult.maker,
                taker: orderSideResult.taker,
                price: priceDataPerToken.nativePrice,
                currency,
                currencyPrice: pricePerToken,
                usdPrice: priceDataPerToken.usdPrice,
                contract: nft.collection.toLowerCase(),
                tokenId,
                amount: numTokens,
                orderSourceId: attributionData.orderSource?.id,
                aggregatorSourceId: attributionData.aggregatorSource?.id,
                fillSourceId: attributionData.fillSource?.id,
                baseEventParams,
              });

              onChainData.fillInfos.push({
                context: `${orderHash}-${baseEventParams.txHash}-${nft.collection}-${token.tokenId}`,
                orderId: orderHash,
                orderSide,
                contract: nft.collection.toLowerCase(),
                tokenId,
                amount: numTokens,
                price: bn(priceDataPerToken.nativePrice).mul(token.numTokens).toString(),
                timestamp: baseEventParams.timestamp,
                maker: orderSideResult.maker,
                taker: orderSideResult.taker,
              });
            }
          }
        }

        onChainData.orderInfos.push({
          context: `filled-${orderHash}`,
          id: orderHash,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        // If an ERC20 transfer occurred in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          onChainData.makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker: buyer,
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
    }
  }

  // return {
  //   nonceCancelEvents,
  //   bulkCancelEvents,
  //   fillEvents,

  //   fillInfos,
  //   orderInfos,
  //   makerInfos,
  // };
};

async function getOrderNonce(
  orderHash: string,
  maker: string,
  params: Pick<BaseEventParams, "block" | "txHash"> | TransactionTrace
): Promise<{ nonce: string | null; txTrace?: TransactionTrace }> {
  const result = await idb.oneOrNone(
    `
      SELECT
        orders.id,
        orders.nonce
      FROM orders
      WHERE orders.kind = 'flow'
        AND orders.id = $/orderHash/
        AND orders.maker = $/maker/
      LIMIT 1
    `,
    {
      orderHash,
      maker: toBuffer(maker),
    }
  );

  if (result?.nonce) {
    return { nonce: result.nonce.toString() };
  }

  const traceResult = await getOrderNonceFromTrace(orderHash, params);
  return traceResult ?? { nonce: null };
}

export type ArrayifiedFlowOrder = [
  boolean,
  string,
  BigNumberish[],
  [string, [BigNumberish, BigNumberish][]][],
  [string, string],
  string,
  string
];
export const decodeArrayifiedOrder = (item: ArrayifiedFlowOrder): Sdk.Flow.Order => {
  const [
    isSellOrder,
    signer,
    constraints,
    arrayifiedNfts,
    [complication, currency],
    extraParams,
    sig,
  ] = item;

  const nfts: Sdk.Flow.Types.OrderNFTs[] = arrayifiedNfts.map(
    ([collection, arrayifiedTokens]: [string, [BigNumberish, BigNumberish][]]) => {
      return {
        collection: collection.toLowerCase(),
        tokens: arrayifiedTokens.map(([tokenId, numTokens]: [BigNumberish, BigNumberish]) => {
          return {
            tokenId: bn(tokenId).toString(),
            numTokens: bn(numTokens).toNumber(),
          };
        }),
      };
    }
  );

  const params: Sdk.Flow.Types.SignedOrder = {
    isSellOrder,
    signer: signer.toLowerCase(),
    constraints: constraints.map((item) => bn(item).toString()),
    nfts,
    execParams: [complication, currency].map((x) => x.toLowerCase()),
    extraParams,
    sig,
  };

  return new Sdk.Flow.Order(config.chainId, params);
};

export const FlowFulfillOrderMethods = {
  matchOneToManyOrders: {
    methodId: "0x63f3c034",
    decodeInput: (input: string, iface: Interface): Sdk.Flow.Order[] => {
      const [makerOrder, manyMakerOrders] = iface.decodeFunctionData("matchOneToManyOrders", input);
      return [makerOrder, ...manyMakerOrders].map(decodeArrayifiedOrder);
    },
  },
  matchOneToOneOrders: {
    methodId: "0x9d9a0cef",
    decodeInput: (input: string, iface: Interface): Sdk.Flow.Order[] => {
      const [makerOrders1, makerOrders2] = iface.decodeFunctionData("matchOneToOneOrders", input);
      return [...makerOrders1, ...makerOrders2].map(decodeArrayifiedOrder);
    },
  },
  matchOrders: {
    methodId: "0x0df4239c",
    decodeInput: (input: string, iface: Interface): Sdk.Flow.Order[] => {
      const [sells, buys] = iface.decodeFunctionData("matchOrders", input);
      return [...sells, ...buys].map(decodeArrayifiedOrder);
    },
  },
  takeMultipleOneOrders: {
    methodId: "0x78759e13",
    decodeInput: (input: string, iface: Interface): Sdk.Flow.Order[] => {
      const [makerOrders] = iface.decodeFunctionData("takeMultipleOneOrders", input);
      return makerOrders.map(decodeArrayifiedOrder);
    },
  },
  takeOrders: {
    methodId: "0x723d9836",
    decodeInput: (input: string, iface: Interface): Sdk.Flow.Order[] => {
      const [makerOrders] = iface.decodeFunctionData("takeOrders", input);
      return makerOrders.map(decodeArrayifiedOrder);
    },
  },
};

export async function getOrderNonceFromTrace(
  orderHash: string,
  params: Pick<BaseEventParams, "block" | "txHash"> | TransactionTrace
): Promise<{ nonce: string | null; txTrace: TransactionTrace } | null> {
  let txTrace;
  if ("calls" in params) {
    txTrace = params;
  } else {
    txTrace = await utils.fetchTransactionTrace(params.txHash);
    if (!txTrace) {
      // Skip any failed attempts to get the trace
      return null;
    }
  }

  const exchange = new Sdk.Flow.Exchange(config.chainId);
  const trace = searchForCall(txTrace.calls, {
    to: Sdk.Flow.Addresses.Exchange[config.chainId],
    type: "CALL",
    sigHashes: Object.values(FlowFulfillOrderMethods).map((item) => item.methodId),
  });

  if (trace) {
    const input = trace?.input;
    const method = Object.values(FlowFulfillOrderMethods).find((method) => {
      return input.startsWith(method.methodId);
    });

    if (method) {
      try {
        const result = method.decodeInput(input, exchange.contract.interface);
        const order = result.find((item) => item.hash() === orderHash);
        if (order) {
          return { nonce: order.nonce, txTrace };
        }
      } catch {
        // This can only happen if the input is not in the correct format
        // i.e. attempted to decode with the incorrect method
      }
    }
  }

  return { nonce: null, txTrace };
}

async function getOrderSide(
  orderHash: string,
  seller: string,
  buyer: string,
  params: Pick<BaseEventParams, "block" | "txHash"> | TransactionTrace
) {
  let txTrace = "calls" in params ? params : null;
  const sellerOrderNonceResponse = await getOrderNonce(orderHash, seller, txTrace ?? params);
  if (sellerOrderNonceResponse.txTrace) {
    txTrace = sellerOrderNonceResponse.txTrace;
  }

  if (sellerOrderNonceResponse.nonce) {
    return {
      maker: seller,
      taker: buyer,
      isSellOrder: true,
      nonce: sellerOrderNonceResponse.nonce,
      txTrace,
    };
  }

  const buyerOrderNonceResponse = await getOrderNonce(orderHash, buyer, txTrace ?? params);

  if (buyerOrderNonceResponse.txTrace) {
    txTrace = buyerOrderNonceResponse.txTrace;
  }
  if (buyerOrderNonceResponse.nonce) {
    return {
      maker: buyer,
      taker: seller,
      isSellOrder: false,
      nonce: buyerOrderNonceResponse.nonce,
      txTrace,
    };
  }

  return { nonce: null, txTrace };
}
