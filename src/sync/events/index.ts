import { defaultAbiCoder } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";

import { logger } from "@/common/logger";
import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { EventDataKind, getEventData } from "@/events-sync/data";
import * as es from "@/events-sync/storage";
import { parseEvent } from "@/events-sync/parser";
import * as syncEventsUtils from "@/events-sync/utils";
import * as blockCheck from "@/jobs/events-sync/block-check-queue";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";
import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";
import * as blocksModel from "@/models/blocks";
import { OrderKind } from "@/orderbook/orders";
import * as Foundation from "@/orderbook/orders/foundation";
import { Sources } from "@/models/sources";

// TODO: Split into multiple files (by exchange).
// TODO: For simplicity, don't use bulk inserts/upserts for realtime
// processing (this will make things so much more flexible). However
// for backfill procesing, we should still use bulk operations so as
// to be performant enough. This might imply separate code to handle
// backfill vs realtime events.

export const syncEvents = async (
  fromBlock: number,
  toBlock: number,
  options?: {
    backfill?: boolean;
    eventDataKinds?: EventDataKind[];
  }
) => {
  // --- Handle: synchronous timestamps of events ---

  // Fetch the timestamps of the blocks at each side of the range in
  // order to be able to estimate the timestamp of each block within
  // the range (to avoid any further `eth_getBlockByNumber` calls).
  const [fromBlockTimestamp, toBlockTimestamp] = await Promise.all([
    baseProvider.getBlock(fromBlock),
    baseProvider.getBlock(toBlock),
  ]).then((blocks) => [blocks[0].timestamp, blocks[1].timestamp]);

  const blockRange = {
    from: {
      block: fromBlock,
      timestamp: fromBlockTimestamp,
    },
    to: {
      block: toBlock,
      timestamp: toBlockTimestamp,
    },
  };

  // --- Handle: known router contract fills ---

  // Fills going through router contracts are to be handled in a
  // custom way so as to properly associate the maker and taker.
  const routerToFillSource: { [address: string]: string } = {};

  // TODO: Move router detection logic to the core SDK

  // Reservoir
  if (Sdk.Router.Addresses.AllRouters[config.chainId]) {
    for (const address of Sdk.Router.Addresses.AllRouters[config.chainId]) {
      routerToFillSource[address.toLowerCase()] = "reservoir";
    }
  }

  // Gem and Genie (source: https://dune.com/sohwak/NFT-Aggregator-(OpenSea-via-GemGenie)-Overview)
  if (config.chainId === 1) {
    routerToFillSource["0x0000000031f7382a812c64b604da4fc520afef4b"] = "gem";
    routerToFillSource["0xf24629fbb477e10f2cf331c2b7452d8596b5c7a5"] = "gem";
    routerToFillSource["0x83c8f28c26bf6aaca652df1dbbe0e1b56f8baba2"] = "gem";
    routerToFillSource["0x0000000035634b55f3d99b071b5a354f48e10bef"] = "gem";
    routerToFillSource["0x00000000a50bb64b4bbeceb18715748dface08af"] = "gem";
    routerToFillSource["0x0a267cf51ef038fc00e71801f5a524aec06e4f07"] = "genie";
    routerToFillSource["0x2af4b707e1dce8fc345f38cfeeaa2421e54976d5"] = "genie";
  }

  // Keep track of all handled blocks
  const blockHashToNumber: { [hash: string]: number } = {};

  // Keep track of data needed by other processes that will get triggered
  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];
  const mintInfos: tokenUpdatesMint.MintInfo[] = [];

  // --- Handle: fetch and process events ---

  // When backfilling, certain processes are disabled
  const backfill = Boolean(options?.backfill);
  const eventDatas = getEventData(options?.eventDataKinds);
  await baseProvider
    .getLogs({
      // Only keep unique topics (eg. an example of duplicated topics are
      // erc721 and erc20 transfers which have the exact same signature).
      topics: [[...new Set(eventDatas.map(({ topic }) => topic))]],
      fromBlock,
      toBlock,
    })
    .then(async (logs) => {
      const ftTransferEvents: es.ftTransfers.Event[] = [];
      const nftApprovalEvents: es.nftApprovals.Event[] = [];
      const nftTransferEvents: es.nftTransfers.Event[] = [];
      const bulkCancelEvents: es.bulkCancels.Event[] = [];
      const nonceCancelEvents: es.nonceCancels.Event[] = [];
      const cancelEvents: es.cancels.Event[] = [];
      const cancelEventsFoundation: es.cancels.Event[] = [];
      const fillEvents: es.fills.Event[] = [];
      const fillEventsPartial: es.fills.Event[] = [];
      const fillEventsFoundation: es.fills.Event[] = [];
      const foundationOrders: Foundation.OrderInfo[] = [];

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
          const baseEventParams = parseEvent(log, blockRange);

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

          // Save the block
          if (!options?.backfill) {
            blockHashToNumber[baseEventParams.blockHash] = baseEventParams.block;
          }

          // Find first matching event:
          // - matching topic
          // - matching number of topics (eg. indexed fields)
          // - matching addresses
          const eventData = eventDatas.find(
            ({ addresses, topic, numTopics }) =>
              log.topics[0] === topic &&
              log.topics.length === numTopics &&
              (addresses ? addresses[log.address.toLowerCase()] : true)
          );

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
                  approved,
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

              if (
                ![
                  Sdk.Common.Addresses.Weth[config.chainId],
                  Sdk.Common.Addresses.Eth[config.chainId],
                ].includes(currency)
              ) {
                // Skip if the payment token is not supported.
                break;
              }

              // 1 - COMPLETE_SELL_OFFER
              // 2 - COMPLETE_BUY_OFFER
              // 5 - COMPLETE_AUCTION
              if (![1, 2, 5].includes(op)) {
                // Skip any irrelevant events.
                break;
              }

              // Handle filling through routers
              let fillSource: string | undefined;
              if (routerToFillSource[taker]) {
                fillSource = routerToFillSource[taker];
                taker = await syncEventsUtils
                  .fetchTransaction(baseEventParams.txHash)
                  .then((tx) => tx.from);
              }

              // Decode the sold token (ignoring bundles).
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

              const orderKind = "x2y2";
              const orderSide = [1, 5].includes(op) ? "sell" : "buy";
              const price = item.price.toString();
              const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);

              fillEvents.push({
                orderKind,
                orderId,
                orderSide,
                orderSourceIdInt,
                maker,
                taker,
                price,
                contract,
                tokenId,
                // X2Y2 only supports ERC721 for now
                amount: "1",
                fillSource,
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
                price,
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

            // Foundation

            case "foundation-buy-price-set": {
              const parsedLog = eventData.abi.parseLog(log);
              const contract = parsedLog.args["nftContract"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const maker = parsedLog.args["seller"].toLowerCase();
              const price = parsedLog.args["price"].toString();

              foundationOrders.push({
                orderParams: {
                  contract,
                  tokenId,
                  maker,
                  price,
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
                metadata: {
                  source: "Foundation",
                },
              });

              break;
            }

            case "foundation-buy-price-accepted": {
              const parsedLog = eventData.abi.parseLog(log);
              const contract = parsedLog.args["nftContract"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const maker = parsedLog.args["seller"].toLowerCase();
              let taker = parsedLog.args["buyer"].toLowerCase();
              const protocolFee = parsedLog.args["protocolFee"].toString();

              const orderId = keccak256(["address", "uint256"], [contract, tokenId]);

              // Handle filling through routers
              let fillSource: string | undefined;
              if (routerToFillSource[taker]) {
                fillSource = routerToFillSource[taker];
                taker = await syncEventsUtils
                  .fetchTransaction(baseEventParams.txHash)
                  .then((tx) => tx.from);
              }

              const orderKind = "foundation";
              // Deduce the price from the protocol fee (which is 5%)
              const price = bn(protocolFee).mul(10000).div(50).toString();
              const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);

              // Custom handling to support on-chain orderbook quirks.
              fillEventsFoundation.push({
                orderKind,
                orderId,
                orderSide: "sell",
                orderSourceIdInt,
                maker,
                taker,
                price,
                contract,
                tokenId,
                // Foundation only supports erc721 for now
                amount: "1",
                fillSource,
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
                orderSide: "sell",
                contract,
                tokenId,
                amount: "1",
                price,
                timestamp: baseEventParams.timestamp,
              });

              break;
            }

            case "foundation-buy-price-invalidated":
            case "foundation-buy-price-cancelled": {
              const parsedLog = eventData.abi.parseLog(log);
              const contract = parsedLog.args["nftContract"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();

              const orderId = keccak256(["address", "uint256"], [contract, tokenId]);

              // Custom handling to support on-chain orderbook quirks.
              cancelEventsFoundation.push({
                orderKind: "foundation",
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

            // LooksRare

            case "looks-rare-cancel-all-orders": {
              const parsedLog = eventData.abi.parseLog(log);
              const maker = parsedLog.args["user"].toLowerCase();
              const newMinNonce = parsedLog.args["newMinNonce"].toString();

              bulkCancelEvents.push({
                orderKind: "looks-rare",
                maker,
                minNonce: newMinNonce,
                baseEventParams,
              });

              break;
            }

            case "looks-rare-cancel-multiple-orders": {
              const parsedLog = eventData.abi.parseLog(log);
              const maker = parsedLog.args["user"].toLowerCase();
              const orderNonces = parsedLog.args["orderNonces"].map(String);

              let batchIndex = 1;
              for (const orderNonce of orderNonces) {
                nonceCancelEvents.push({
                  orderKind: "looks-rare",
                  maker,
                  nonce: orderNonce,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: batchIndex++,
                  },
                });
              }

              break;
            }

            case "looks-rare-taker-ask": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["orderHash"].toLowerCase();
              const orderNonce = parsedLog.args["orderNonce"].toString();
              const maker = parsedLog.args["maker"].toLowerCase();
              let taker = parsedLog.args["taker"].toLowerCase();
              const currency = parsedLog.args["currency"].toLowerCase();
              const price = parsedLog.args["price"].toString();
              const contract = parsedLog.args["collection"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const amount = parsedLog.args["amount"].toString();

              if (![Sdk.Common.Addresses.Weth[config.chainId]].includes(currency)) {
                // Skip if the payment token is not supported
                break;
              }

              // Handle filling through routers
              let fillSource: string | undefined;
              if (routerToFillSource[taker]) {
                fillSource = routerToFillSource[taker];
                taker = await syncEventsUtils
                  .fetchTransaction(baseEventParams.txHash)
                  .then((tx) => tx.from);
              }

              const orderKind = "looks-rare";
              const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);

              fillEvents.push({
                orderKind,
                orderId,
                orderSide: "buy",
                orderSourceIdInt,
                maker,
                taker,
                price,
                contract,
                tokenId,
                amount,
                fillSource,
                baseEventParams,
              });

              // Cancel all the other orders of the maker having the same nonce.
              nonceCancelEvents.push({
                orderKind: "looks-rare",
                maker,
                nonce: orderNonce,
                baseEventParams,
              });

              orderInfos.push({
                context: `filled-${orderId}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });

              fillInfos.push({
                context: orderId,
                orderId: orderId,
                orderSide: "buy",
                contract,
                tokenId,
                amount,
                price,
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
                    orderKind: "looks-rare",
                  },
                });
              }

              break;
            }

            case "looks-rare-taker-bid": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["orderHash"].toLowerCase();
              const orderNonce = parsedLog.args["orderNonce"].toString();
              const maker = parsedLog.args["maker"].toLowerCase();
              let taker = parsedLog.args["taker"].toLowerCase();
              const currency = parsedLog.args["currency"].toLowerCase();
              const price = parsedLog.args["price"].toString();
              const contract = parsedLog.args["collection"].toLowerCase();
              const tokenId = parsedLog.args["tokenId"].toString();
              const amount = parsedLog.args["amount"].toString();

              if (![Sdk.Common.Addresses.Weth[config.chainId]].includes(currency)) {
                // Skip if the payment token is not supported
                break;
              }

              // Handle filling through routers
              let fillSource: string | undefined;
              if (routerToFillSource[taker]) {
                fillSource = routerToFillSource[taker];
                taker = await syncEventsUtils
                  .fetchTransaction(baseEventParams.txHash)
                  .then((tx) => tx.from);
              }

              const orderKind = "looks-rare";
              const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);

              fillEvents.push({
                orderKind,
                orderId,
                orderSide: "sell",
                orderSourceIdInt,
                maker,
                taker,
                price,
                contract,
                tokenId,
                amount,
                fillSource,
                baseEventParams,
              });

              // Cancel all the other orders of the maker having the same nonce.
              nonceCancelEvents.push({
                orderKind: "looks-rare",
                maker,
                nonce: orderNonce,
                baseEventParams,
              });

              orderInfos.push({
                context: `filled-${orderId}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });

              fillInfos.push({
                context: orderId,
                orderId: orderId,
                orderSide: "sell",
                contract,
                tokenId,
                amount,
                price,
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
                    orderKind: "looks-rare",
                  },
                });
              }

              break;
            }

            // WyvernV2/WyvernV2.3

            // Wyvern V2 is now decomissioned, but we still keep handling
            // its fill event in order to get access to historical sales.
            // This is only relevant when backfilling though.

            case "wyvern-v2-orders-matched":
            case "wyvern-v2.3-orders-matched": {
              const parsedLog = eventData.abi.parseLog(log);
              const buyOrderId = parsedLog.args["buyHash"].toLowerCase();
              const sellOrderId = parsedLog.args["sellHash"].toLowerCase();
              const maker = parsedLog.args["maker"].toLowerCase();
              let taker = parsedLog.args["taker"].toLowerCase();
              const price = parsedLog.args["price"].toString();

              // The code below assumes that events are retrieved in chronological
              // order from the blockchain (this is safe to assume in most cases).

              // With Wyvern, there are two main issues:
              // - the traded token is not included in the fill event, so we have
              // to deduce it by checking the nft transfer occured exactly before
              // the fill event
              // - the payment token is not included in the fill event, and we deduce
              // it as well by checking any Erc20 transfers that occured close before
              // the fill event (and default to native Eth if cannot find any)

              // Detect the traded token
              let associatedNftTransferEvent: es.nftTransfers.Event | undefined;
              if (nftTransferEvents.length) {
                // Ensure the last nft transfer event was part of the fill
                const event = nftTransferEvents[nftTransferEvents.length - 1];
                if (
                  event.baseEventParams.txHash === baseEventParams.txHash &&
                  event.baseEventParams.logIndex === baseEventParams.logIndex - 1 &&
                  // Only single token fills are supported and recognized
                  event.baseEventParams.batchIndex === 1
                ) {
                  associatedNftTransferEvent = event;
                }
              }

              if (!associatedNftTransferEvent) {
                // Skip if we can't associate to an nft transfer event
                break;
              }

              // Detect the payment token
              let paymentToken = Sdk.Common.Addresses.Eth[config.chainId];
              for (const event of currentTxEvents.slice(0, -1).reverse()) {
                // Skip once we detect another fill in the same transaction
                // (this will happen if filling through an aggregator).
                if (event.log.topics[0] === getEventData([eventData.kind])[0].topic) {
                  break;
                }

                // If we detect an Erc20 transfer as part of the same transaction
                // then we assume it's the payment for the current sale and so we
                // only keep the sale if the payment token is Weth.
                const erc20EventData = getEventData(["erc20-transfer"])[0];
                if (
                  event.log.topics[0] === erc20EventData.topic &&
                  event.log.topics.length === erc20EventData.numTopics
                ) {
                  const parsed = erc20EventData.abi.parseLog(event.log);
                  const from = parsed.args["from"].toLowerCase();
                  const to = parsed.args["to"].toLowerCase();
                  const amount = parsed.args["amount"].toString();
                  if (
                    ((maker === from && taker === to) || (maker === to && taker === from)) &&
                    amount <= price
                  ) {
                    paymentToken = event.log.address.toLowerCase();
                    break;
                  }
                }
              }

              if (
                ![
                  Sdk.Common.Addresses.Eth[config.chainId],
                  Sdk.Common.Addresses.Weth[config.chainId],
                ].includes(paymentToken)
              ) {
                // Skip if the payment token is not supported
                break;
              }

              // Handle filling through routers
              let fillSource: string | undefined;
              if (routerToFillSource[taker]) {
                fillSource = routerToFillSource[taker];
                taker = await syncEventsUtils
                  .fetchTransaction(baseEventParams.txHash)
                  .then((tx) => tx.from);
              }

              const orderKind = eventData.kind.startsWith("wyvern-v2.3")
                ? "wyvern-v2.3"
                : "wyvern-v2";

              const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);

              let batchIndex = 1;
              if (buyOrderId !== HashZero) {
                fillEvents.push({
                  orderKind,
                  orderId: buyOrderId,
                  orderSide: "buy",
                  orderSourceIdInt,
                  maker,
                  taker,
                  price,
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  fillSource,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: batchIndex++,
                  },
                });

                orderInfos.push({
                  context: `filled-${buyOrderId}`,
                  id: buyOrderId,
                  trigger: {
                    kind: "sale",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                });

                fillInfos.push({
                  context: buyOrderId,
                  orderId: buyOrderId,
                  orderSide: "buy",
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  price,
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
                      orderKind,
                    },
                  });
                }
              }
              if (sellOrderId !== HashZero) {
                fillEvents.push({
                  orderKind,
                  orderId: sellOrderId,
                  orderSide: "sell",
                  orderSourceIdInt,
                  maker,
                  taker,
                  price,
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  fillSource,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: batchIndex++,
                  },
                });

                orderInfos.push({
                  context: `filled-${sellOrderId}`,
                  id: sellOrderId,
                  trigger: {
                    kind: "sale",
                    txHash: baseEventParams.txHash,
                    txTimestamp: baseEventParams.timestamp,
                  },
                });

                fillInfos.push({
                  context: sellOrderId,
                  orderId: sellOrderId,
                  orderSide: "sell",
                  contract: associatedNftTransferEvent.baseEventParams.address,
                  tokenId: associatedNftTransferEvent.tokenId,
                  amount: associatedNftTransferEvent.amount,
                  price,
                  timestamp: baseEventParams.timestamp,
                });
              }

              break;
            }

            case "wyvern-v2.3-order-cancelled": {
              const parsedLog = eventData.abi.parseLog(log);
              const orderId = parsedLog.args["hash"].toLowerCase();

              cancelEvents.push({
                orderKind: "wyvern-v2.3",
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

            case "wyvern-v2.3-nonce-incremented": {
              const parsedLog = eventData.abi.parseLog(log);
              const maker = parsedLog.args["maker"].toLowerCase();
              const newNonce = parsedLog.args["newNonce"].toString();

              bulkCancelEvents.push({
                orderKind: "wyvern-v2.3",
                maker,
                minNonce: newNonce,
                baseEventParams,
              });

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
              let erc20TokenAmount = parsedLog.args["erc20TokenAmount"].toString();
              const erc721Token = parsedLog.args["erc721Token"].toLowerCase();
              const erc721TokenId = parsedLog.args["erc721TokenId"].toString();

              if (
                ![
                  Sdk.ZeroExV4.Addresses.Eth[config.chainId],
                  Sdk.OpenDao.Addresses.Eth[config.chainId],
                  Sdk.Common.Addresses.Weth[config.chainId],
                ].includes(erc20Token)
              ) {
                // Skip if the payment token is not supported
                break;
              }

              // Handle filling through routers
              let fillSource: string | undefined;
              if (routerToFillSource[taker]) {
                fillSource = routerToFillSource[taker];
                taker = await syncEventsUtils
                  .fetchTransaction(baseEventParams.txHash)
                  .then((tx) => tx.from);
              }

              const orderKind = eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind;
              const orderSide = direction === 0 ? "sell" : "buy";
              const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);

              let orderId: string | undefined;
              if (!backfill) {
                // Since the event doesn't include the exact order which got matched
                // (it only includes the nonce, but we can potentially have multiple
                // different orders sharing the same nonce off-chain), we attempt to
                // detect the order id which got filled by checking the database for
                // orders which have the exact nonce/value/token-set combination (it
                // doesn't cover all cases, but it's good enough for now).
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
                      LIMIT 1
                    `,
                    {
                      maker: toBuffer(maker),
                      nonce,
                      contract: toBuffer(erc721Token),
                    }
                  )
                  .then((result) => {
                    if (result) {
                      orderId = result.id;
                      // Workaround the fact that 0xv4 fill events exclude the fee from the price
                      erc20TokenAmount = result.price;
                    }
                  });
              }

              fillEvents.push({
                orderKind,
                orderId,
                orderSide,
                orderSourceIdInt,
                maker,
                taker,
                price: erc20TokenAmount,
                contract: erc721Token,
                tokenId: erc721TokenId,
                amount: "1",
                fillSource,
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
                price: erc20TokenAmount,
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
              let erc20FillAmount = parsedLog.args["erc20FillAmount"].toString();
              const erc1155Token = parsedLog.args["erc1155Token"].toLowerCase();
              const erc1155TokenId = parsedLog.args["erc1155TokenId"].toString();
              const erc1155FillAmount = parsedLog.args["erc1155FillAmount"].toString();

              if (
                ![
                  Sdk.ZeroExV4.Addresses.Eth[config.chainId],
                  Sdk.OpenDao.Addresses.Eth[config.chainId],
                  Sdk.Common.Addresses.Weth[config.chainId],
                ].includes(erc20Token)
              ) {
                // Skip if the payment token is not supported
                break;
              }

              // Handle filling through routers
              let fillSource: string | undefined;
              if (routerToFillSource[taker]) {
                fillSource = routerToFillSource[taker];
                taker = await syncEventsUtils
                  .fetchTransaction(baseEventParams.txHash)
                  .then((tx) => tx.from);
              }

              const orderKind = eventData!.kind.split("-").slice(0, -2).join("-") as OrderKind;
              const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);
              const value = bn(erc20FillAmount).div(erc1155FillAmount).toString();

              let orderId: string | undefined;
              if (!backfill) {
                // For erc1155 orders we only allow unique maker/nonce orders.
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
                        AND orders.contract IS NOT NULL
                      LIMIT 1
                    `,
                    {
                      maker: toBuffer(maker),
                      nonce,
                    }
                  )
                  .then((result) => {
                    if (result) {
                      orderId = result.id;
                      // Workaround the fact that 0xv4 fill events exclude the fee from the price
                      erc20FillAmount = bn(result.price).mul(erc1155FillAmount).toString();
                    }
                  });
              }

              // Custom handling to support partial filling
              fillEventsPartial.push({
                orderKind,
                orderId,
                orderSide: direction === 0 ? "sell" : "buy",
                orderSourceIdInt,
                maker,
                taker,
                price: erc20FillAmount,
                contract: erc1155Token,
                tokenId: erc1155TokenId,
                amount: erc1155FillAmount,
                fillSource,
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
                orderSide: direction === 0 ? "sell" : "buy",
                contract: erc1155Token,
                tokenId: erc1155TokenId,
                amount: erc1155FillAmount,
                price: value,
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
                let side: "sell" | "buy";
                if (saleInfo.paymentToken === Sdk.Common.Addresses.Eth[config.chainId]) {
                  side = "sell";
                } else if (saleInfo.paymentToken === Sdk.Common.Addresses.Weth[config.chainId]) {
                  side = "buy";
                } else {
                  break;
                }

                if (saleInfo.recipientOverride) {
                  taker = saleInfo.recipientOverride;
                }

                // Handle filling through routers
                let fillSource: string | undefined;
                if (routerToFillSource[taker]) {
                  fillSource = routerToFillSource[taker];
                  taker = await syncEventsUtils
                    .fetchTransaction(baseEventParams.txHash)
                    .then((tx) => tx.from);
                }

                const price = bn(saleInfo.price).div(saleInfo.amount).toString();

                const orderKind = "seaport";
                const orderSourceIdInt = await getOrderSourceByOrderKind(orderKind);

                // Custom handling to support partial filling
                fillEventsPartial.push({
                  orderKind,
                  orderId,
                  orderSide: side,
                  orderSourceIdInt,
                  maker,
                  taker,
                  price,
                  contract: saleInfo.contract,
                  tokenId: saleInfo.tokenId,
                  amount: saleInfo.amount,
                  fillSource,
                  baseEventParams,
                });

                fillInfos.push({
                  context: `${orderId}-${baseEventParams.txHash}`,
                  orderId: orderId,
                  orderSide: side,
                  contract: saleInfo.contract,
                  tokenId: saleInfo.tokenId,
                  amount: saleInfo.amount,
                  price,
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
          }
        } catch (error) {
          logger.info("sync-events", `Failed to handle events: ${error}`);
          throw error;
        }
      }

      if (!backfill) {
        // Assign source based on order for each fill.
        await Promise.all([
          assignOrderSourceToFillEvents(fillEvents),
          assignOrderSourceToFillEvents(fillEventsPartial),
          assignOrderSourceToFillEvents(fillEventsFoundation),
        ]);
      }

      // WARNING! Ordering matters (fills should come in front of cancels).
      await Promise.all([
        es.fills.addEvents(fillEvents),
        es.fills.addEventsPartial(fillEventsPartial),
        es.fills.addEventsFoundation(fillEventsFoundation),
      ]);

      await Promise.all([
        es.nonceCancels.addEvents(nonceCancelEvents, backfill),
        es.bulkCancels.addEvents(bulkCancelEvents, backfill),
        es.cancels.addEvents(cancelEvents),
        es.cancels.addEventsFoundation(cancelEventsFoundation),
        es.ftTransfers.addEvents(ftTransferEvents, backfill),
        es.nftApprovals.addEvents(nftApprovalEvents),
        es.nftTransfers.addEvents(nftTransferEvents, backfill),
      ]);

      // Add all the fill events to the activity queue
      const fillActivitiesInfo: processActivityEvent.EventInfo[] = _.map(
        _.concat(fillEvents, fillEventsPartial, fillEventsFoundation),
        (event) => ({
          kind: processActivityEvent.EventKind.fillEvent,
          data: {
            contract: event.contract,
            tokenId: event.tokenId,
            fromAddress: event.maker,
            toAddress: event.taker,
            price: Number(event.price),
            amount: Number(event.amount),
            transactionHash: event.baseEventParams.txHash,
            logIndex: event.baseEventParams.logIndex,
            batchIndex: event.baseEventParams.batchIndex,
            blockHash: event.baseEventParams.blockHash,
            timestamp: event.baseEventParams.timestamp,
          },
        })
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

      if (!backfill) {
        // WARNING! It's very important to guarantee that the previous
        // events are persisted to the database before any of the jobs
        // below are executed. Otherwise, the jobs can potentially use
        // stale data which will cause inconsistencies (eg. orders can
        // have wrong statuses).
        await Promise.all([
          fillUpdates.addToQueue(fillInfos),
          orderUpdatesById.addToQueue(orderInfos),
          orderUpdatesByMaker.addToQueue(makerInfos),
          orderbookOrders.addToQueue(
            foundationOrders.map((info) => ({ kind: "foundation", info }))
          ),
        ]);

        // --- Handle: orphan blocks ---

        for (const [hash, number] of Object.entries(blockHashToNumber)) {
          // Persist the block
          await blocksModel.saveBlock({ hash, number });

          // Act right away if the current block is a duplicate
          if ((await blocksModel.getBlocks(number)).length > 1) {
            blockCheck.addToQueue(number, 10 * 1000);
            blockCheck.addToQueue(number, 30 * 1000);
          }
        }

        // Put all fetched blocks on a queue for handling block reorgs
        // (recheck each block in 1m, 5m, 10m and 60m).
        // TODO: The check frequency should be a per-chain setting
        await Promise.all(
          Object.entries(blockHashToNumber).map(async ([, block]) =>
            Promise.all([
              blockCheck.addToQueue(block, 60 * 1000),
              blockCheck.addToQueue(block, 5 * 60 * 1000),
              blockCheck.addToQueue(block, 10 * 60 * 1000),
              blockCheck.addToQueue(block, 60 * 60 * 1000),
            ])
          )
        );
      }

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

const assignOrderSourceToFillEvents = async (fillEvents: es.fills.Event[]) => {
  try {
    const orderIds = fillEvents.filter((e) => e.orderId !== undefined).map((e) => e.orderId);

    if (orderIds.length) {
      const orders = [];

      const orderIdsChunks = _.chunk(orderIds, 100);

      for (const orderIdsChunk of orderIdsChunks) {
        const ordersChunk = await redb.manyOrNone(
          `
            SELECT id, source_id_int from orders
            WHERE id IN ($/orderIds/)
            AND source_id_int IS NOT NULL
          `,
          {
            orderIds: orderIdsChunk.join(","),
          }
        );

        orders.push(...ordersChunk);
      }

      if (orders.length) {
        const orderSourceIdByOrderId = new Map<string, number>();

        for (const order of orders) {
          orderSourceIdByOrderId.set(order.id, order.source_id_int);
        }

        fillEvents.forEach((event, index) => {
          if (event.orderId == undefined) return;

          const orderSourceId = orderSourceIdByOrderId.get(event.orderId!);

          // If the order source id exists on the order, use it in the fill event.
          if (orderSourceId) {
            logger.info(
              "sync-events",
              `Orders source assigned to fill event: ${JSON.stringify(
                event
              )}, orderSourceId: ${orderSourceId}`
            );

            fillEvents[index].orderSourceIdInt = orderSourceId;
          }
        });
      }
    }
  } catch (e) {
    logger.error("sync-events", `Failed to assign order source id to fill events: ${e}`);
  }
};

const getOrderSourceByOrderKind = async (orderKind: string) => {
  try {
    const sources = await Sources.getInstance();

    switch (orderKind) {
      case "x2y2":
        return sources.getByName("X2Y2").id;
      case "foundation":
        return sources.getByName("Foundation").id;
      case "looks-rare":
        return sources.getByName("LooksRare").id;
      case "seaport":
      case "wyvern-v2":
      case "wyvern-v2.3":
        return sources.getByName("OpenSea").id;
      default:
        return null; // For all others, we can't assume where the order originated from.
    }
  } catch (e) {
    logger.error("sync-events", `Failed to get order source by order kind: ${e}`);
    return null;
  }
};
