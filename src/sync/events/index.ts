import { defaultAbiCoder } from "@ethersproject/abi";
import { Filter, Log } from "@ethersproject/abstract-provider";
import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { EventDataKind, getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { BaseEventParams, parseEvent } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";
import * as syncEventsUtils from "@/events-sync/utils";
import * as blocksModel from "@/models/blocks";
import { OrderKind, getOrderSourceByOrderKind } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";
import * as blockCheck from "@/jobs/events-sync/block-check-queue";
import * as eventsSyncBackfillProcess from "@/jobs/events-sync/process/backfill";
import * as eventsSyncRealtimeProcess from "@/jobs/events-sync/process/realtime";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";

// TODO: Split into multiple files (by exchange)
// TODO: For simplicity, don't use bulk inserts/upserts for realtime
// processing (this will make things so much more flexible). However
// for backfill procesing, we should still use bulk operations so as
// to be performant enough. This might imply separate code to handle
// backfill vs realtime events.

// Cache the network settings
const NS = getNetworkSettings();

const COMPONENT_NAME = "sync-events";

export const syncEvents = async (
  fromBlock: number,
  toBlock: number,
  options?: {
    // When backfilling, certain further processes will be disabled
    backfill?: boolean;
    // When true, writing of any non-sale event is disabled
    skipNonFillWrites?: boolean;
    syncDetails:
      | {
          method: "event-data-kind";
          eventDataKinds: EventDataKind[];
        }
      | {
          method: "address";
          // By default, ethers doesn't support filtering by multiple addresses.
          // A workaround for that is included in the V2 indexer, but for now we
          // simply skip it since there aren't many use-cases for filtering that
          // includes multiple addresses.
          // https://github.com/reservoirprotocol/indexer-v2/blob/main/src/syncer/base/index.ts
          address: string;
        };
  }
) => {
  // --- Handle: fetch and process events ---

  // Cache blocks for efficiency
  const blocksCache = new Map<number, blocksModel.Block>();
  // Keep track of all handled `${block}-${blockHash}` pairs
  const blocksSet = new Set<string>();

  // Keep track of data needed by other processes that will get triggered
  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];
  const mintInfos: tokenUpdatesMint.MintInfo[] = [];

  // For handling mints as sales
  const tokensMinted = new Map<
    string,
    {
      contract: string;
      from: string;
      tokenId: string;
      amount: string;
      baseEventParams: BaseEventParams;
    }[]
  >();

  // When backfilling, certain processes are disabled
  const backfill = Boolean(options?.backfill);

  // Before proceeding, fetch all individual blocks within the current range
  if (toBlock - fromBlock + 1 <= 32) {
    const limit = pLimit(32);
    await Promise.all(
      _.range(fromBlock, toBlock + 1).map((block) => limit(() => syncEventsUtils.fetchBlock(block)))
    );
  }

  // --- Generate the event filtering parameters ---

  // By default, we filter by all available topics
  let eventFilter: Filter = {
    // Convert to a set in order to skip duplicate topics
    topics: [[...new Set(getEventData().map(({ topic }) => topic))]],
    fromBlock,
    toBlock,
  };

  if (options?.syncDetails?.method === "event-data-kind") {
    // Filter by a subset of topics
    eventFilter = {
      // Convert to a set in order to skip duplicate topics
      topics: [
        [...new Set(getEventData(options.syncDetails.eventDataKinds).map(({ topic }) => topic))],
      ],
      fromBlock,
      toBlock,
    };
  } else if (options?.syncDetails?.method === "address") {
    // Filter by contract address
    eventFilter = {
      address: options.syncDetails.address,
      fromBlock,
      toBlock,
    };
  }

  const availableEventData = getEventData();
  const enhancedEvents: EnhancedEvent[] = [];
  await baseProvider.getLogs(eventFilter).then(async (logs) => {
    const ftTransferEvents: es.ftTransfers.Event[] = [];
    const nftApprovalEvents: es.nftApprovals.Event[] = [];
    const nftTransferEvents: es.nftTransfers.Event[] = [];
    const bulkCancelEvents: es.bulkCancels.Event[] = [];
    const nonceCancelEvents: es.nonceCancels.Event[] = [];
    const cancelEvents: es.cancels.Event[] = [];
    const fillEvents: es.fills.Event[] = [];
    const fillEventsPartial: es.fills.Event[] = [];

    // Keep track of all events within the currently processing transaction
    let currentTx: string | undefined;
    let currentTxEvents: {
      log: Log;
      address: string;
      logIndex: number;
    }[] = [];

    const currentTxHasWethTransfer = () => {
      for (const event of currentTxEvents.slice(0, -1).reverse()) {
        const erc20EventData = getEventData(["erc20-transfer"])[0];
        if (
          event.log.topics[0] === erc20EventData.topic &&
          event.log.topics.length === erc20EventData.numTopics &&
          erc20EventData.addresses?.[event.log.address.toLowerCase()]
        ) {
          return true;
        }
      }
      return false;
    };

    for (const log of logs) {
      try {
        const baseEventParams = await parseEvent(log, blocksCache);
        blocksSet.add(`${log.blockNumber}-${log.blockHash}`);

        // It's quite important from a performance perspective to have
        // the block data available before proceeding with the events
        if (!blocksCache.has(baseEventParams.block)) {
          blocksCache.set(
            baseEventParams.block,
            await blocksModel.saveBlock({
              number: baseEventParams.block,
              hash: baseEventParams.blockHash,
              timestamp: baseEventParams.timestamp,
            })
          );
        }

        // Save the event in the currently processing transaction data
        if (currentTx !== baseEventParams.txHash) {
          currentTx = baseEventParams.txHash;
          currentTxEvents = [];
        }
        currentTxEvents.push({
          log,
          address: baseEventParams.address,
          logIndex: baseEventParams.logIndex,
        });

        // Find first matching event:
        // - matching topic
        // - matching number of topics (eg. indexed fields)
        // - matching addresses
        const eventData = availableEventData.find(
          ({ addresses, topic, numTopics }) =>
            log.topics[0] === topic &&
            log.topics.length === numTopics &&
            (addresses ? addresses[log.address.toLowerCase()] : true)
        );
        if (eventData) {
          enhancedEvents.push({
            kind: eventData.kind,
            baseEventParams,
            log,
          });
        }

        switch (eventData?.kind) {
          // Erc721

          case "erc721-transfer": {
            const parsedLog = eventData.abi.parseLog(log);
            const from = parsedLog.args["from"].toLowerCase();
            const to = parsedLog.args["to"].toLowerCase();
            const tokenId = parsedLog.args["tokenId"].toString();

            nftTransferEvents.push({
              kind: "erc721",
              from,
              to,
              tokenId,
              amount: "1",
              baseEventParams,
            });

            // Make sure to only handle the same data once per transaction
            const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenId}`;

            makerInfos.push({
              context: `${contextPrefix}-${from}-sell-balance`,
              maker: from,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "sell-balance",
                contract: baseEventParams.address,
                tokenId,
              },
            });
            makerInfos.push({
              context: `${contextPrefix}-${to}-sell-balance`,
              maker: to,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "sell-balance",
                contract: baseEventParams.address,
                tokenId,
              },
            });

            if (from === AddressZero) {
              mintInfos.push({
                contract: baseEventParams.address,
                tokenId,
                mintedTimestamp: baseEventParams.timestamp,
              });

              // Treat mints as sales
              if (!NS.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
                if (!tokensMinted.has(baseEventParams.txHash)) {
                  tokensMinted.set(baseEventParams.txHash, []);
                }
                tokensMinted.get(baseEventParams.txHash)!.push({
                  contract: baseEventParams.address,
                  tokenId,
                  from,
                  amount: "1",
                  baseEventParams,
                });
              }
            }

            break;
          }

          // Erc1155

          case "erc1155-transfer-single": {
            const parsedLog = eventData.abi.parseLog(log);
            const from = parsedLog.args["from"].toLowerCase();
            const to = parsedLog.args["to"].toLowerCase();
            const tokenId = parsedLog.args["tokenId"].toString();
            const amount = parsedLog.args["amount"].toString();

            nftTransferEvents.push({
              kind: "erc1155",
              from,
              to,
              tokenId,
              amount,
              baseEventParams,
            });

            // Make sure to only handle the same data once per transaction
            const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenId}`;

            makerInfos.push({
              context: `${contextPrefix}-${from}-sell-balance`,
              maker: from,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "sell-balance",
                contract: baseEventParams.address,
                tokenId,
              },
            });
            makerInfos.push({
              context: `${contextPrefix}-${to}-sell-balance`,
              maker: to,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "sell-balance",
                contract: baseEventParams.address,
                tokenId,
              },
            });

            if (from === AddressZero) {
              mintInfos.push({
                contract: baseEventParams.address,
                tokenId,
                mintedTimestamp: baseEventParams.timestamp,
              });

              // Treat mints as sales
              if (!NS.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
                if (!tokensMinted.has(baseEventParams.txHash)) {
                  tokensMinted.set(baseEventParams.txHash, []);
                }
                tokensMinted.get(baseEventParams.txHash)!.push({
                  contract: baseEventParams.address,
                  tokenId,
                  from,
                  amount,
                  baseEventParams,
                });
              }
            }

            break;
          }

          case "erc1155-transfer-batch": {
            const parsedLog = eventData.abi.parseLog(log);
            const from = parsedLog.args["from"].toLowerCase();
            const to = parsedLog.args["to"].toLowerCase();
            const tokenIds = parsedLog.args["tokenIds"].map(String);
            const amounts = parsedLog.args["amounts"].map(String);

            const count = Math.min(tokenIds.length, amounts.length);
            for (let i = 0; i < count; i++) {
              nftTransferEvents.push({
                kind: "erc1155",
                from,
                to,
                tokenId: tokenIds[i],
                amount: amounts[i],
                baseEventParams: {
                  ...baseEventParams,
                  batchIndex: i + 1,
                },
              });

              // Make sure to only handle the same data once per transaction
              const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenIds[i]}`;

              makerInfos.push({
                context: `${contextPrefix}-${from}-sell-balance`,
                maker: from,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId: tokenIds[i],
                },
              });
              makerInfos.push({
                context: `${contextPrefix}-${to}-sell-balance`,
                maker: to,
                trigger: {
                  kind: "balance-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "sell-balance",
                  contract: baseEventParams.address,
                  tokenId: tokenIds[i],
                },
              });

              if (from === AddressZero) {
                mintInfos.push({
                  contract: baseEventParams.address,
                  tokenId: tokenIds[i],
                  mintedTimestamp: baseEventParams.timestamp,
                });

                // Treat mints as sales
                if (!NS.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
                  if (!tokensMinted.has(baseEventParams.txHash)) {
                    tokensMinted.set(baseEventParams.txHash, []);
                  }
                  tokensMinted.get(baseEventParams.txHash)!.push({
                    contract: baseEventParams.address,
                    tokenId: tokenIds[i],
                    amount: amounts[i],
                    from,
                    baseEventParams,
                  });
                }
              }
            }

            break;
          }

          // Erc721/Erc1155 common

          case "erc721/1155-approval-for-all": {
            const parsedLog = eventData.abi.parseLog(log);
            const owner = parsedLog.args["owner"].toLowerCase();
            const operator = parsedLog.args["operator"].toLowerCase();
            const approved = parsedLog.args["approved"];

            nftApprovalEvents.push({
              owner,
              operator,
              approved,
              baseEventParams,
            });

            // Make sure to only handle the same data once per on-chain event
            // (instead of once per transaction as we do with balance updates
            // since we're handling nft approvals differently - checking them
            // individually).
            const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${baseEventParams.logIndex}`;

            makerInfos.push({
              context: `${contextPrefix}-${owner}-sell-approval`,
              maker: owner,
              trigger: {
                kind: "approval-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "sell-approval",
                contract: baseEventParams.address,
                operator,
              },
            });

            break;
          }

          // Erc20

          case "erc20-transfer": {
            const parsedLog = eventData.abi.parseLog(log);
            const from = parsedLog.args["from"].toLowerCase();
            const to = parsedLog.args["to"].toLowerCase();
            const amount = parsedLog.args["amount"].toString();

            ftTransferEvents.push({
              from,
              to,
              amount,
              baseEventParams,
            });

            // Make sure to only handle the same data once per transaction
            const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

            makerInfos.push({
              context: `${contextPrefix}-${from}-buy-balance`,
              maker: from,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "buy-balance",
                contract: baseEventParams.address,
              },
            });
            makerInfos.push({
              context: `${contextPrefix}-${to}-buy-balance`,
              maker: to,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "buy-balance",
                contract: baseEventParams.address,
              },
            });

            break;
          }

          case "erc20-approval": {
            const parsedLog = eventData.abi.parseLog(log);
            const owner = parsedLog.args["owner"].toLowerCase();
            const spender = parsedLog.args["spender"].toLowerCase();

            // Make sure to only handle the same data once per transaction
            const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

            makerInfos.push({
              context: `${contextPrefix}-${owner}-${spender}-buy-approval`,
              maker: owner,
              trigger: {
                kind: "approval-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "buy-approval",
                contract: Sdk.Common.Addresses.Weth[config.chainId],
                operator: spender,
              },
            });

            break;
          }

          // Weth

          case "weth-deposit": {
            const parsedLog = eventData.abi.parseLog(log);
            const to = parsedLog.args["to"].toLowerCase();
            const amount = parsedLog.args["amount"].toString();

            ftTransferEvents.push({
              from: AddressZero,
              to,
              amount,
              baseEventParams,
            });

            // Make sure to only handle the same data once per transaction
            const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

            makerInfos.push({
              context: `${contextPrefix}-${to}-buy-balance`,
              maker: to,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "buy-balance",
                contract: baseEventParams.address,
              },
            });

            break;
          }

          case "weth-withdrawal": {
            const parsedLog = eventData.abi.parseLog(log);
            const from = parsedLog.args["from"].toLowerCase();
            const amount = parsedLog.args["amount"].toString();

            ftTransferEvents.push({
              from,
              to: AddressZero,
              amount,
              baseEventParams,
            });

            // Make sure to only handle the same data once per transaction
            const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}`;

            makerInfos.push({
              context: `${contextPrefix}-${from}-buy-balance`,
              maker: from,
              trigger: {
                kind: "balance-change",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
              data: {
                kind: "buy-balance",
                contract: baseEventParams.address,
              },
            });

            break;
          }

          // X2Y2

          case "x2y2-order-cancelled": {
            const parsedLog = eventData.abi.parseLog(log);
            const orderId = parsedLog.args["itemHash"].toLowerCase();

            cancelEvents.push({
              orderKind: "x2y2",
              orderId,
              baseEventParams,
            });
            orderInfos.push({
              context: `cancelled-${orderId}-${baseEventParams.txHash}`,
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

          case "x2y2-order-inventory": {
            const parsedLog = eventData.abi.parseLog(log);
            const orderId = parsedLog.args["itemHash"].toLowerCase();
            const maker = parsedLog.args["maker"].toLowerCase();
            let taker = parsedLog.args["taker"].toLowerCase();
            const currency = parsedLog.args["currency"].toLowerCase();
            const item = parsedLog.args["item"];
            const op = parsedLog.args["detail"].op;

            // 1 - COMPLETE_SELL_OFFER
            // 2 - COMPLETE_BUY_OFFER
            // 5 - COMPLETE_AUCTION
            if (![1, 2, 5].includes(op)) {
              // Skip any irrelevant events
              break;
            }

            // Handle: attribution

            const orderKind = "x2y2";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            const currencyPrice = item.price.toString();
            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            // Decode the sold token (ignoring bundles)
            let contract: string;
            let tokenId: string;
            try {
              const decodedItems = defaultAbiCoder.decode(
                ["(address contract, uint256 tokenId)[]"],
                item.data
              );
              if (decodedItems[0].length !== 1) {
                break;
              }

              contract = decodedItems[0][0].contract.toLowerCase();
              tokenId = decodedItems[0][0].tokenId.toString();
            } catch {
              break;
            }

            const orderSide = [1, 5].includes(op) ? "sell" : "buy";
            fillEvents.push({
              orderKind,
              orderId,
              orderSide,
              maker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract,
              tokenId,
              // TODO: Support X2Y2 ERC1155 orders
              amount: "1",
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            orderInfos.push({
              context: `filled-${orderId}-${baseEventParams.txHash}`,
              id: orderId,
              trigger: {
                kind: "sale",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
            });

            fillInfos.push({
              context: `${orderId}-${baseEventParams.txHash}`,
              orderId: orderId,
              orderSide,
              contract,
              tokenId,
              amount: "1",
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            if (currentTxHasWethTransfer()) {
              makerInfos.push({
                context: `${baseEventParams.txHash}-buy-approval`,
                maker,
                trigger: {
                  kind: "approval-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "buy-approval",
                  contract: Sdk.Common.Addresses.Weth[config.chainId],
                  orderKind: "x2y2",
                },
              });
            }

            break;
          }

          // ZeroExV4 + OpenDao

          case "zeroex-v4-erc721-order-cancelled":
          case "zeroex-v4-erc1155-order-cancelled":
          case "opendao-erc721-order-cancelled":
          case "opendao-erc1155-order-cancelled": {
            const parsedLog = eventData.abi.parseLog(log);
            const maker = parsedLog.args["maker"].toLowerCase();
            const nonce = parsedLog.args["nonce"].toString();

            nonceCancelEvents.push({
              orderKind: eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind,
              maker,
              nonce,
              baseEventParams,
            });

            break;
          }

          case "zeroex-v4-erc721-order-filled":
          case "opendao-erc721-order-filled": {
            const parsedLog = eventData.abi.parseLog(log);
            const direction = parsedLog.args["direction"];
            const maker = parsedLog.args["maker"].toLowerCase();
            let taker = parsedLog.args["taker"].toLowerCase();
            const nonce = parsedLog.args["nonce"].toString();
            const erc20Token = parsedLog.args["erc20Token"].toLowerCase();
            const erc20TokenAmount = parsedLog.args["erc20TokenAmount"].toString();
            const erc721Token = parsedLog.args["erc721Token"].toLowerCase();
            const erc721TokenId = parsedLog.args["erc721TokenId"].toString();

            // Handle: attribution

            const orderKind = eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind;
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            // By default, use the price without fees
            let currencyPrice = erc20TokenAmount;

            let orderId: string | undefined;
            if (!backfill) {
              // Since the event doesn't include the exact order which got matched
              // (it only includes the nonce, but we can potentially have multiple
              // different orders sharing the same nonce off-chain), we attempt to
              // detect the order id which got filled by checking the database for
              // orders which have the exact nonce/contract/price combination.
              await idb
                .oneOrNone(
                  `
                      SELECT
                        orders.id,
                        orders.price
                      FROM orders
                      WHERE orders.kind = '${orderKind}'
                        AND orders.maker = $/maker/
                        AND orders.nonce = $/nonce/
                        AND orders.contract = $/contract/
                        AND (orders.raw_data ->> 'erc20TokenAmount')::NUMERIC = $/price/
                      LIMIT 1
                    `,
                  {
                    maker: toBuffer(maker),
                    nonce,
                    contract: toBuffer(erc721Token),
                    price: erc20TokenAmount,
                  }
                )
                .then((result) => {
                  if (result) {
                    orderId = result.id;
                    // Workaround the fact that 0xv4 fill events exclude the fee from the price
                    currencyPrice = result.price;
                  }
                });
            }

            let currency = erc20Token;
            if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
              // Map the weird 0x ETH address
              currency = Sdk.Common.Addresses.Eth[config.chainId];
            }

            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            const orderSide = direction === 0 ? "sell" : "buy";
            fillEvents.push({
              orderKind,
              orderId,
              orderSide,
              maker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract: erc721Token,
              tokenId: erc721TokenId,
              amount: "1",
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            // Cancel all the other orders of the maker having the same nonce.
            nonceCancelEvents.push({
              orderKind,
              maker,
              nonce,
              baseEventParams,
            });

            if (orderId) {
              orderInfos.push({
                context: `filled-${orderId}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });
            }

            fillInfos.push({
              context: orderId || `${maker}-${nonce}`,
              orderId: orderId,
              orderSide,
              contract: erc721Token,
              tokenId: erc721TokenId,
              amount: "1",
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            if (currentTxHasWethTransfer()) {
              makerInfos.push({
                context: `${baseEventParams.txHash}-buy-approval`,
                maker,
                trigger: {
                  kind: "approval-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "buy-approval",
                  contract: Sdk.Common.Addresses.Weth[config.chainId],
                  orderKind: orderKind,
                },
              });
            }

            break;
          }

          case "zeroex-v4-erc1155-order-filled":
          case "opendao-erc1155-order-filled": {
            const parsedLog = eventData.abi.parseLog(log);
            const direction = parsedLog.args["direction"];
            const maker = parsedLog.args["maker"].toLowerCase();
            let taker = parsedLog.args["taker"].toLowerCase();
            const nonce = parsedLog.args["nonce"].toString();
            const erc20Token = parsedLog.args["erc20Token"].toLowerCase();
            const erc20FillAmount = parsedLog.args["erc20FillAmount"].toString();
            const erc1155Token = parsedLog.args["erc1155Token"].toLowerCase();
            const erc1155TokenId = parsedLog.args["erc1155TokenId"].toString();
            const erc1155FillAmount = parsedLog.args["erc1155FillAmount"].toString();

            // Handle: attribution

            const orderKind = eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind;
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            // By default, use the price without fees
            let currencyPrice = bn(erc20FillAmount).div(erc1155FillAmount).toString();

            let orderId: string | undefined;
            if (!backfill) {
              // For erc1155 orders we only allow unique nonce/contract/price. Since erc1155
              // orders are partially fillable, we have to detect the price of an individual
              // item from the fill amount, which might result in imprecise results. However
              // at the moment, we can live with it.
              await idb
                .oneOrNone(
                  `
                      SELECT
                        orders.id,
                        orders.price
                      FROM orders
                      WHERE orders.kind = '${orderKind}'
                        AND orders.maker = $/maker/
                        AND orders.nonce = $/nonce/
                        AND orders.contract = $/contract/
                        AND (orders.raw_data ->> 'erc20TokenAmount')::NUMERIC / (orders.raw_data ->> 'nftAmount')::NUMERIC = $/price/
                      LIMIT 1
                    `,
                  {
                    maker: toBuffer(maker),
                    nonce,
                    contract: toBuffer(erc1155Token),
                    price: bn(erc20FillAmount).div(erc1155FillAmount).toString(),
                  }
                )
                .then((result) => {
                  if (result) {
                    orderId = result.id;
                    // Workaround the fact that 0xv4 fill events exclude the fee from the price
                    currencyPrice = bn(result.price).mul(erc1155FillAmount).toString();
                  }
                });
            }

            let currency = erc20Token;
            if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
              // Map the weird 0x ETH address
              currency = Sdk.Common.Addresses.Eth[config.chainId];
            }

            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            const orderSide = direction === 0 ? "sell" : "buy";
            fillEventsPartial.push({
              orderKind,
              orderId,
              orderSide,
              maker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract: erc1155Token,
              tokenId: erc1155TokenId,
              amount: erc1155FillAmount,
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            if (orderId) {
              orderInfos.push({
                context: `filled-${orderId}-${baseEventParams.txHash}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });
            }

            fillInfos.push({
              context: orderId || `${maker}-${nonce}`,
              orderId: orderId,
              orderSide,
              contract: erc1155Token,
              tokenId: erc1155TokenId,
              amount: erc1155FillAmount,
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            if (currentTxHasWethTransfer()) {
              makerInfos.push({
                context: `${baseEventParams.txHash}-buy-approval`,
                maker,
                trigger: {
                  kind: "approval-change",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                data: {
                  kind: "buy-approval",
                  contract: Sdk.Common.Addresses.Weth[config.chainId],
                  orderKind: orderKind,
                },
              });
            }

            break;
          }

          // Seaport

          case "seaport-order-cancelled": {
            const parsedLog = eventData.abi.parseLog(log);
            const orderId = parsedLog.args["orderHash"].toLowerCase();

            cancelEvents.push({
              orderKind: "seaport",
              orderId,
              baseEventParams,
            });

            orderInfos.push({
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

          case "seaport-counter-incremented": {
            const parsedLog = eventData.abi.parseLog(log);
            const maker = parsedLog.args["offerer"].toLowerCase();
            const newCounter = parsedLog.args["newCounter"].toString();

            bulkCancelEvents.push({
              orderKind: "seaport",
              maker,
              minNonce: newCounter,
              baseEventParams,
            });

            break;
          }

          case "seaport-order-filled": {
            const parsedLog = eventData.abi.parseLog(log);
            const orderId = parsedLog.args["orderHash"].toLowerCase();
            const maker = parsedLog.args["offerer"].toLowerCase();
            let taker = parsedLog.args["recipient"].toLowerCase();
            const offer = parsedLog.args["offer"];
            const consideration = parsedLog.args["consideration"];

            const saleInfo = new Sdk.Seaport.Exchange(config.chainId).deriveBasicSale(
              offer,
              consideration
            );
            if (saleInfo) {
              // Handle: attribution

              const orderKind = "seaport";
              const data = await syncEventsUtils.extractAttributionData(
                baseEventParams.txHash,
                orderKind
              );
              if (data.taker) {
                taker = data.taker;
              }

              if (saleInfo.recipientOverride) {
                taker = saleInfo.recipientOverride;
              }

              // Handle: prices

              const currency = saleInfo.paymentToken;
              const currencyPrice = bn(saleInfo.price).div(saleInfo.amount).toString();
              const prices = await getUSDAndNativePrices(
                currency,
                currencyPrice,
                baseEventParams.timestamp
              );
              if (!prices.nativePrice) {
                // We must always have the native price
                break;
              }

              const orderSide = saleInfo.side as "sell" | "buy";
              fillEventsPartial.push({
                orderKind,
                orderId,
                orderSide,
                maker,
                taker,
                price: prices.nativePrice,
                currency,
                currencyPrice,
                usdPrice: prices.usdPrice,
                contract: saleInfo.contract,
                tokenId: saleInfo.tokenId,
                amount: saleInfo.amount,
                orderSourceId: data.orderSource?.id,
                aggregatorSourceId: data.aggregatorSource?.id,
                fillSourceId: data.fillSource?.id,
                baseEventParams,
              });

              fillInfos.push({
                context: `${orderId}-${baseEventParams.txHash}`,
                orderId: orderId,
                orderSide,
                contract: saleInfo.contract,
                tokenId: saleInfo.tokenId,
                amount: saleInfo.amount,
                price: prices.nativePrice,
                timestamp: baseEventParams.timestamp,
              });
            }

            orderInfos.push({
              context: `filled-${orderId}-${baseEventParams.txHash}`,
              id: orderId,
              trigger: {
                kind: "sale",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
            });

            break;
          }

          // Rarible / Universe

          case "universe-match":
          case "rarible-match": {
            const { args } = eventData.abi.parseLog(log);
            const leftHash = args["leftHash"].toLowerCase();
            const leftMaker = args["leftMaker"].toLowerCase();
            let taker = args["rightMaker"].toLowerCase();
            const newLeftFill = args["newLeftFill"].toString();
            const newRightFill = args["newRightFill"].toString();
            const leftAsset = args["leftAsset"];
            const rightAsset = args["rightAsset"];

            const ERC20 = "0x8ae85d84";
            const ETH = "0xaaaebeba";
            const ERC721 = "0x73ad2146";
            const ERC1155 = "0x973bb640";

            const assetTypes = [ERC721, ERC1155, ERC20, ETH];

            // Exclude orders with exotic asset types
            if (
              !assetTypes.includes(leftAsset.assetClass) ||
              !assetTypes.includes(rightAsset.assetClass)
            ) {
              break;
            }

            // Assume the left order is the maker's order
            const side = [ERC721, ERC1155].includes(leftAsset.assetClass) ? "sell" : "buy";

            const currencyAsset = side === "sell" ? rightAsset : leftAsset;
            const nftAsset = side === "sell" ? leftAsset : rightAsset;

            // Handle: attribution

            const orderKind = eventData.kind.startsWith("universe") ? "universe" : "rarible";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            let currency: string;
            if (currencyAsset.assetClass === ETH) {
              currency = Sdk.Common.Addresses.Eth[config.chainId];
            } else if (currencyAsset.assetClass === ERC20) {
              const decodedCurrencyAsset = defaultAbiCoder.decode(
                ["(address token)"],
                currencyAsset.data
              );
              currency = decodedCurrencyAsset[0][0];
            } else {
              break;
            }

            const decodedNftAsset = defaultAbiCoder.decode(
              ["(address token, uint tokenId)"],
              nftAsset.data
            );

            const contract = decodedNftAsset[0][0].toLowerCase();
            const tokenId = decodedNftAsset[0][1].toString();

            let currencyPrice = side === "sell" ? newLeftFill : newRightFill;
            const amount = side === "sell" ? newRightFill : newLeftFill;
            currencyPrice = bn(currencyPrice).div(amount).toString();

            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            fillEventsPartial.push({
              orderKind,
              orderId: leftHash,
              orderSide: side,
              maker: leftMaker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract,
              tokenId,
              amount,
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: leftHash,
              orderId: leftHash,
              orderSide: side,
              contract,
              tokenId,
              amount,
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            break;
          }

          // Element

          case "element-erc721-sell-order-filled": {
            const { args } = eventData.abi.parseLog(log);
            const maker = args["maker"].toLowerCase();
            let taker = args["taker"].toLowerCase();
            const erc20Token = args["erc20Token"].toLowerCase();
            const erc20TokenAmount = args["erc20TokenAmount"].toString();
            const erc721Token = args["erc721Token"].toLowerCase();
            const erc721TokenId = args["erc721TokenId"].toString();
            const orderHash = args["orderHash"].toLowerCase();

            // Handle: attribution

            const orderKind = "element-erc721";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            let currency = erc20Token;
            if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
              // Map the weird 0x ETH address
              currency = Sdk.Common.Addresses.Eth[config.chainId];
            }
            const currencyPrice = erc20TokenAmount;

            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            fillEventsPartial.push({
              orderKind,
              orderId: orderHash,
              orderSide: "sell",
              maker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract: erc721Token,
              tokenId: erc721TokenId,
              amount: "1",
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: orderHash,
              orderId: orderHash,
              orderSide: "sell",
              contract: erc721Token,
              tokenId: erc721TokenId,
              amount: "1",
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            break;
          }

          case "element-erc721-buy-order-filled": {
            const { args } = eventData.abi.parseLog(log);
            const maker = args["maker"].toLowerCase();
            let taker = args["taker"].toLowerCase();
            const erc20Token = args["erc20Token"].toLowerCase();
            const erc20TokenAmount = args["erc20TokenAmount"].toString();
            const erc721Token = args["erc721Token"].toLowerCase();
            const erc721TokenId = args["erc721TokenId"].toString();
            const orderHash = args["orderHash"].toLowerCase();

            // Handle: attribution

            const orderKind = "element-erc721";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            let currency = erc20Token;
            if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
              // Map the weird 0x ETH address
              currency = Sdk.Common.Addresses.Eth[config.chainId];
            }
            const currencyPrice = erc20TokenAmount;

            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            fillEventsPartial.push({
              orderKind,
              orderId: orderHash,
              orderSide: "buy",
              maker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract: erc721Token,
              tokenId: erc721TokenId,
              amount: "1",
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: orderHash,
              orderId: orderHash,
              orderSide: "buy",
              contract: erc721Token,
              tokenId: erc721TokenId,
              amount: "1",
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            break;
          }

          case "element-erc1155-sell-order-filled": {
            const { args } = eventData.abi.parseLog(log);
            const maker = args["maker"].toLowerCase();
            let taker = args["taker"].toLowerCase();
            const erc20Token = args["erc20Token"].toLowerCase();
            const erc20FillAmount = args["erc20FillAmount"].toString();
            const erc1155Token = args["erc1155Token"].toLowerCase();
            const erc1155TokenId = args["erc1155TokenId"].toString();
            const erc1155FillAmount = args["erc1155FillAmount"].toString();
            const orderHash = args["orderHash"].toLowerCase();

            // Handle: attribution

            const orderKind = "element-erc1155";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            let currency = erc20Token;
            if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
              // Map the weird 0x ETH address
              currency = Sdk.Common.Addresses.Eth[config.chainId];
            }
            const currencyPrice = bn(erc20FillAmount).div(erc1155FillAmount).toString();

            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            fillEventsPartial.push({
              orderKind,
              orderId: orderHash,
              orderSide: "sell",
              maker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract: erc1155Token,
              tokenId: erc1155TokenId,
              amount: erc1155FillAmount,
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: orderHash,
              orderId: orderHash,
              orderSide: "sell",
              contract: erc1155Token,
              tokenId: erc1155TokenId,
              amount: erc1155FillAmount,
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            break;
          }

          case "element-erc1155-buy-order-filled": {
            const { args } = eventData.abi.parseLog(log);
            const maker = args["maker"].toLowerCase();
            let taker = args["taker"].toLowerCase();
            const erc20Token = args["erc20Token"].toLowerCase();
            const erc20FillAmount = args["erc20FillAmount"].toString();
            const erc1155Token = args["erc1155Token"].toLowerCase();
            const erc1155TokenId = args["erc1155TokenId"].toString();
            const erc1155FillAmount = args["erc1155FillAmount"].toString();
            const orderHash = args["orderHash"].toLowerCase();

            // Handle: attribution

            const orderKind = "element-erc1155";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            let currency = erc20Token;
            if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
              // Map the weird 0x ETH address
              currency = Sdk.Common.Addresses.Eth[config.chainId];
            }
            const currencyPrice = bn(erc20FillAmount).div(erc1155FillAmount).toString();

            const prices = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            fillEventsPartial.push({
              orderKind,
              orderId: orderHash,
              orderSide: "buy",
              maker,
              taker,
              price: prices.nativePrice,
              currency,
              currencyPrice,
              usdPrice: prices.usdPrice,
              contract: erc1155Token,
              tokenId: erc1155TokenId,
              amount: erc1155FillAmount,
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: orderHash,
              orderId: orderHash,
              orderSide: "buy",
              contract: erc1155Token,
              tokenId: erc1155TokenId,
              amount: erc1155FillAmount,
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            break;
          }

          // Quixotic

          case "quixotic-order-filled": {
            const parsedLog = eventData.abi.parseLog(log);
            const orderId = parsedLog.args["orderHash"].toLowerCase();
            const maker = parsedLog.args["offerer"].toLowerCase();
            let taker = parsedLog.args["recipient"].toLowerCase();
            const offer = parsedLog.args["offer"];
            const consideration = parsedLog.args["consideration"];

            // TODO: Switch to `Quixotic` class once integrated
            const saleInfo = new Sdk.Seaport.Exchange(config.chainId).deriveBasicSale(
              offer,
              consideration
            );
            if (saleInfo) {
              let side: "sell" | "buy";
              if (saleInfo.paymentToken === Sdk.Common.Addresses.Eth[config.chainId]) {
                side = "sell";
              } else if (saleInfo.paymentToken === Sdk.Common.Addresses.Weth[config.chainId]) {
                side = "buy";
              } else {
                break;
              }

              // Handle: attribution

              const orderKind = "quixotic";
              const data = await syncEventsUtils.extractAttributionData(
                baseEventParams.txHash,
                orderKind
              );
              if (data.taker) {
                taker = data.taker;
              }

              if (saleInfo.recipientOverride) {
                taker = saleInfo.recipientOverride;
              }

              // Handle: prices

              const currency = saleInfo.paymentToken;
              const currencyPrice = bn(saleInfo.price).div(saleInfo.amount).toString();
              const prices = await getUSDAndNativePrices(
                currency,
                currencyPrice,
                baseEventParams.timestamp
              );
              if (!prices.nativePrice) {
                // We must always have the native price
                break;
              }

              fillEventsPartial.push({
                orderKind,
                orderId,
                orderSide: side,
                maker,
                taker,
                price: prices.nativePrice,
                currency,
                currencyPrice,
                usdPrice: prices.usdPrice,
                contract: saleInfo.contract,
                tokenId: saleInfo.tokenId,
                amount: saleInfo.amount,
                orderSourceId: data.orderSource?.id,
                aggregatorSourceId: data.aggregatorSource?.id,
                fillSourceId: data.fillSource?.id,
                baseEventParams,
              });

              fillInfos.push({
                context: `${orderId}-${baseEventParams.txHash}`,
                orderId: orderId,
                orderSide: side,
                contract: saleInfo.contract,
                tokenId: saleInfo.tokenId,
                amount: saleInfo.amount,
                price: prices.nativePrice,
                timestamp: baseEventParams.timestamp,
              });
            }

            orderInfos.push({
              context: `filled-${orderId}-${baseEventParams.txHash}`,
              id: orderId,
              trigger: {
                kind: "sale",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
            });

            break;
          }

          // Zora

          case "zora-ask-filled": {
            const { args } = eventData.abi.parseLog(log);
            const tokenContract = args["tokenContract"].toLowerCase();
            const tokenId = args["tokenId"].toString();
            let taker = args["buyer"].toLowerCase();
            const ask = args["ask"];
            const seller = ask["seller"].toLowerCase();
            const askCurrency = ask["askCurrency"].toLowerCase();
            const askPrice = ask["askPrice"].toString();

            // Handle: attribution

            const orderKind = "zora-v3";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            const prices = await getUSDAndNativePrices(
              askCurrency,
              askPrice,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            fillEvents.push({
              orderKind,
              currency: askCurrency,
              orderSide: "sell",
              maker: seller,
              taker,
              price: prices.nativePrice,
              currencyPrice: askPrice,
              usdPrice: prices.usdPrice,
              contract: tokenContract,
              tokenId,
              amount: "1",
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: `zora-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
              orderSide: "sell",
              contract: tokenContract,
              tokenId,
              amount: "1",
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            break;
          }

          case "zora-auction-ended": {
            const { args } = eventData.abi.parseLog(log);
            const tokenId = args["tokenId"].toString();
            const tokenContract = args["tokenContract"].toLowerCase();
            const tokenOwner = args["tokenOwner"].toLowerCase();
            let taker = args["winner"].toLowerCase();
            const amount = args["amount"].toString();
            const curatorFee = args["curatorFee"].toString();
            const auctionCurrency = args["auctionCurrency"].toLowerCase();

            const price = bn(amount).add(curatorFee).toString();

            // Handle: attribution

            const orderKind = "zora-v3";
            const data = await syncEventsUtils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (data.taker) {
              taker = data.taker;
            }

            // Handle: prices

            const prices = await getUSDAndNativePrices(
              auctionCurrency,
              price,
              baseEventParams.timestamp
            );
            if (!prices.nativePrice) {
              // We must always have the native price
              break;
            }

            fillEvents.push({
              orderKind,
              currency: auctionCurrency,
              orderSide: "sell",
              taker,
              maker: tokenOwner,
              price: prices.nativePrice,
              currencyPrice: price,
              usdPrice: prices.usdPrice,
              contract: tokenContract,
              tokenId,
              amount: "1",
              orderSourceId: data.orderSource?.id,
              aggregatorSourceId: data.aggregatorSource?.id,
              fillSourceId: data.fillSource?.id,
              baseEventParams,
            });

            fillInfos.push({
              context: `zora-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
              orderSide: "sell",
              contract: tokenContract,
              tokenId,
              amount: "1",
              price: prices.nativePrice,
              timestamp: baseEventParams.timestamp,
            });

            break;
          }
        }
      } catch (error) {
        logger.info(COMPONENT_NAME, `Failed to handle events: ${error}`);
        throw error;
      }
    }

    // Process the retrieved events asynchronously
    const eventsSyncProcess = backfill ? eventsSyncBackfillProcess : eventsSyncRealtimeProcess;
    await eventsSyncProcess.addToQueue([
      {
        kind: "cryptopunks",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("cryptopunks")),
      },
      {
        kind: "foundation",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("foundation")),
      },
      {
        kind: "looks-rare",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("looks-rare") ||
            // To properly validate bids, we need some additional events
            kind === "erc20-transfer"
        ),
      },
      {
        kind: "nftx",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("nftx")),
      },
      {
        kind: "nouns",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("nouns")),
      },
      {
        kind: "sudoswap",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("sudoswap")),
      },
      {
        kind: "wyvern",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("wyvern") ||
            // To properly handle Wyvern sales, we need some additional events
            kind === "erc721-transfer" ||
            kind === "erc1155-transfer-single" ||
            kind === "erc20-transfer"
        ),
      },
    ]);

    // -- Handle: accurate data ---

    if (!backfill) {
      // Assign accurate sources to the fill events
      await Promise.all([
        assignSourceToFillEvents(fillEvents),
        assignSourceToFillEvents(fillEventsPartial),
      ]);

      // Assign wash trading scores to the fill events
      await Promise.all([
        assignWashTradingScoreToFillEvents(fillEvents),
        assignWashTradingScoreToFillEvents(fillEventsPartial),
      ]);
    }

    // --- Handle: mints as sales ---

    for (const [txHash, mints] of tokensMinted.entries()) {
      if (mints.length > 0) {
        const tx = await syncEventsUtils.fetchTransaction(txHash);

        // Skip free mints
        if (tx.value === "0") {
          continue;
        }

        const totalAmount = mints
          .map(({ amount }) => amount)
          .reduce((a, b) => bn(a).add(b).toString());
        const price = bn(tx.value).div(totalAmount).toString();
        const currency = Sdk.Common.Addresses.Eth[config.chainId];

        for (const mint of mints) {
          // Handle: attribution

          const orderKind = "mint";
          const orderSource = await getOrderSourceByOrderKind(
            orderKind,
            mint.baseEventParams.address
          );

          // Handle: prices

          const prices = await getUSDAndNativePrices(
            currency,
            price,
            mint.baseEventParams.timestamp
          );
          if (!prices.nativePrice) {
            // We must always have the native price
            continue;
          }

          fillEvents.push({
            orderKind,
            orderSide: "sell",
            taker: tx.from,
            maker: mint.from,
            amount: mint.amount,
            currency,
            price: prices.nativePrice,
            currencyPrice: price,
            usdPrice: prices.usdPrice,
            contract: mint.contract,
            tokenId: mint.tokenId,
            // Mints have matching order and fill sources but no aggregator source
            orderSourceId: orderSource?.id,
            fillSourceId: orderSource?.id,
            isPrimary: true,
            baseEventParams: mint.baseEventParams,
          });
        }
      }
    }

    // --- Handle: trigger further jobs ---

    // WARNING! Ordering matters (fills should come in front of cancels).
    await Promise.all([
      es.fills.addEvents(fillEvents),
      es.fills.addEventsPartial(fillEventsPartial),
    ]);

    if (!options?.skipNonFillWrites) {
      await Promise.all([
        es.nonceCancels.addEvents(nonceCancelEvents, backfill),
        es.bulkCancels.addEvents(bulkCancelEvents, backfill),
        es.cancels.addEvents(cancelEvents),
        es.ftTransfers.addEvents(ftTransferEvents, backfill),
        es.nftApprovals.addEvents(nftApprovalEvents),
        es.nftTransfers.addEvents(nftTransferEvents, backfill),
      ]);
    }

    if (!backfill) {
      // WARNING! It's very important to guarantee that the previous
      // events are persisted to the database before any of the jobs
      // below are executed. Otherwise, the jobs can potentially use
      // stale data which will cause inconsistencies (eg. orders can
      // have wrong statuses).
      await Promise.all([
        orderUpdatesById.addToQueue(orderInfos),
        orderUpdatesByMaker.addToQueue(makerInfos),
      ]);
    }

    await fillUpdates.addToQueue(fillInfos);

    // --- Handle: orphan blocks ---

    if (!backfill && NS.enableReorgCheck) {
      for (const blockData of blocksSet.values()) {
        const block = Number(blockData.split("-")[0]);
        const blockHash = blockData.split("-")[1];

        // Act right away if the current block is a duplicate
        if ((await blocksModel.getBlocks(block)).length > 1) {
          await blockCheck.addToQueue(block, blockHash, 10);
          await blockCheck.addToQueue(block, blockHash, 30);
        }
      }

      // Put all fetched blocks on a queue for handling block reorgs
      await Promise.all(
        [...blocksSet.values()].map(async (blockData) => {
          const block = Number(blockData.split("-")[0]);
          const blockHash = blockData.split("-")[1];

          return Promise.all(
            NS.reorgCheckFrequency.map((frequency) =>
              blockCheck.addToQueue(block, blockHash, frequency * 60)
            )
          );
        })
      );
    }

    // --- Handle: activities ---

    // Add all the fill events to the activity queue
    const fillActivitiesInfo: processActivityEvent.EventInfo[] = _.map(
      _.concat(fillEvents, fillEventsPartial),
      (event) => {
        let fromAddress = event.maker;
        let toAddress = event.taker;

        if (event.orderSide === "buy") {
          fromAddress = event.taker;
          toAddress = event.maker;
        }

        return {
          kind: processActivityEvent.EventKind.fillEvent,
          data: {
            contract: event.contract,
            tokenId: event.tokenId,
            fromAddress,
            toAddress,
            price: Number(event.price),
            amount: Number(event.amount),
            transactionHash: event.baseEventParams.txHash,
            logIndex: event.baseEventParams.logIndex,
            batchIndex: event.baseEventParams.batchIndex,
            blockHash: event.baseEventParams.blockHash,
            timestamp: event.baseEventParams.timestamp,
            orderId: event.orderId || "",
            orderSourceIdInt: Number(event.orderSourceId),
          },
        };
      }
    );

    if (!_.isEmpty(fillActivitiesInfo)) {
      await processActivityEvent.addToQueue(fillActivitiesInfo);
    }

    // Add all the transfer/mint events to the activity queue
    const transferActivitiesInfo: processActivityEvent.EventInfo[] = _.map(
      nftTransferEvents,
      (event) => ({
        context: [
          processActivityEvent.EventKind.nftTransferEvent,
          event.baseEventParams.txHash,
          event.baseEventParams.logIndex,
          event.baseEventParams.batchIndex,
        ].join(":"),
        kind: processActivityEvent.EventKind.nftTransferEvent,
        data: {
          contract: event.baseEventParams.address,
          tokenId: event.tokenId,
          fromAddress: event.from,
          toAddress: event.to,
          amount: Number(event.amount),
          transactionHash: event.baseEventParams.txHash,
          logIndex: event.baseEventParams.logIndex,
          batchIndex: event.baseEventParams.batchIndex,
          blockHash: event.baseEventParams.blockHash,
          timestamp: event.baseEventParams.timestamp,
        },
      })
    );

    if (!_.isEmpty(transferActivitiesInfo)) {
      await processActivityEvent.addToQueue(transferActivitiesInfo);
    }

    // --- Handle: mints ---

    // We want to get metadata when backfilling as well
    await tokenUpdatesMint.addToQueue(mintInfos);
  });
};

export const unsyncEvents = async (block: number, blockHash: string) => {
  await Promise.all([
    es.fills.removeEvents(block, blockHash),
    es.bulkCancels.removeEvents(block, blockHash),
    es.nonceCancels.removeEvents(block, blockHash),
    es.cancels.removeEvents(block, blockHash),
    es.ftTransfers.removeEvents(block, blockHash),
    es.nftApprovals.removeEvents(block, blockHash),
    es.nftTransfers.removeEvents(block, blockHash),
    removeUnsyncedEventsActivities.addToQueue(blockHash),
  ]);
};

// In the code above each fill event is assigned a default order source
// based on the order kind. However, that's not accurate at all, so the
// method below will join any fill events that have a known order id to
// the orders table and get the accurate order source from there.
export const assignSourceToFillEvents = async (fillEvents: es.fills.Event[]) => {
  try {
    // Fetch the order ids associated to the passed in fill events
    const orderIds = fillEvents.map((e) => e.orderId).filter(Boolean);
    if (orderIds.length) {
      const orders = [];

      // Get the associated order source for each of the above orders
      const orderIdChunks = _.chunk(orderIds, 100);
      for (const chunk of orderIdChunks) {
        const ordersChunk = await redb.manyOrNone(
          `
            SELECT
              orders.id,
              orders.source_id_int
            FROM orders
            WHERE orders.id IN ($/orderIds:list/)
              AND orders.source_id_int IS NOT NULL
          `,
          { orderIds: chunk }
        );
        orders.push(...ordersChunk);
      }

      if (orders.length) {
        // Create a mapping from order id to its source id
        const orderSourceIdByOrderId = new Map<string, number>();
        for (const order of orders) {
          orderSourceIdByOrderId.set(order.id, order.source_id_int);
        }

        fillEvents.forEach((event) => {
          if (!event.orderId) {
            return;
          }

          // If the current fill event's order has an associated source,
          // then use that as the order source for the fill event
          const orderSourceId = orderSourceIdByOrderId.get(event.orderId!);
          if (orderSourceId) {
            event.orderSourceId = orderSourceId;

            // If the fill event has no aggregator or fill source, then default the fill source to the order source
            if (!event.aggregatorSourceId && !event.fillSourceId) {
              event.fillSourceId = orderSourceId;
            }

            logger.info(
              COMPONENT_NAME,
              `Source '${orderSourceId}' assigned to fill event: ${JSON.stringify(event)}`
            );
          }
        });
      }
    }
  } catch (error) {
    logger.error(COMPONENT_NAME, `Failed to assign sources to fill events: ${error}`);
  }
};

// Each fill event is assigned a wash trading score which is used
// for filtering any wash trading sales from the calculation made
// by the collection volumes processes.
export const assignWashTradingScoreToFillEvents = async (fillEvents: es.fills.Event[]) => {
  try {
    const inverseFillEvents: { contract: Buffer; maker: Buffer; taker: Buffer }[] = [];

    const washTradingExcludedContracts = NS.washTradingExcludedContracts;
    const washTradingWhitelistedAddresses = NS.washTradingWhitelistedAddresses;
    const washTradingBlacklistedAddresses = NS.washTradingBlacklistedAddresses;

    // Filter events that don't need to be checked for inverse sales
    const fillEventsPendingInverseCheck = fillEvents.filter(
      (e) =>
        !washTradingExcludedContracts.includes(e.contract) &&
        !washTradingWhitelistedAddresses.includes(e.maker) &&
        !washTradingWhitelistedAddresses.includes(e.taker) &&
        !washTradingBlacklistedAddresses.includes(e.maker) &&
        !washTradingBlacklistedAddresses.includes(e.taker)
    );

    const fillEventsPendingInverseCheckChunks = _.chunk(fillEventsPendingInverseCheck, 100);
    for (const fillEventsChunk of fillEventsPendingInverseCheckChunks) {
      // TODO: We should never use `raw` queries

      const inverseFillEventsFilter = fillEventsChunk.map(
        (fillEvent) =>
          `('${_.replace(fillEvent.taker, "0x", "\\x")}', '${_.replace(
            fillEvent.maker,
            "0x",
            "\\x"
          )}', '${_.replace(fillEvent.contract, "0x", "\\x")}')`
      );

      const inverseFillEventsChunkQuery = pgp.as.format(
        `
          SELECT DISTINCT contract, maker, taker from fill_events_2
          WHERE (maker, taker, contract) IN ($/inverseFillEventsFilter:raw/)
        `,
        {
          inverseFillEventsFilter: inverseFillEventsFilter.join(","),
        }
      );

      const inverseFillEventsChunk = await redb.manyOrNone(inverseFillEventsChunkQuery);
      inverseFillEvents.push(...inverseFillEventsChunk);
    }

    fillEvents.forEach((event, index) => {
      // Mark event as wash trading for any blacklisted addresses
      let washTradingDetected =
        washTradingBlacklistedAddresses.includes(event.maker) ||
        washTradingBlacklistedAddresses.includes(event.taker);

      if (!washTradingDetected) {
        // Mark event as wash trading if we find a corresponding transfer from taker
        washTradingDetected = inverseFillEvents.some((inverseFillEvent) => {
          return (
            event.maker == fromBuffer(inverseFillEvent.taker) &&
            event.taker == fromBuffer(inverseFillEvent.maker) &&
            event.contract == fromBuffer(inverseFillEvent.contract)
          );
        });
      }

      if (washTradingDetected) {
        logger.info(COMPONENT_NAME, `Wash trading detected on event: ${JSON.stringify(event)}`);
      }

      fillEvents[index].washTradingScore = Number(washTradingDetected);
    });
  } catch (error) {
    logger.error(COMPONENT_NAME, `Failed to assign wash trading score to fill events: ${error}`);
  }
};
