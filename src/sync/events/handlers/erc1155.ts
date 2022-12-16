import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { BaseEventParams } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getOrderSourceByOrderKind } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const fillEvents: es.fills.Event[] = [];
  const nftTransferEvents: es.nftTransfers.Event[] = [];

  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];
  const mintInfos: tokenUpdatesMint.MintInfo[] = [];

  // For handling mints as sales
  const mintedTokens = new Map<
    string,
    {
      contract: string;
      from: string;
      tokenId: string;
      amount: string;
      baseEventParams: BaseEventParams;
    }[]
  >();

  // Cache the network settings
  const ns = getNetworkSettings();

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
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

        if (ns.mintAddresses.includes(from)) {
          mintInfos.push({
            contract: baseEventParams.address,
            tokenId,
            mintedTimestamp: baseEventParams.timestamp,
          });

          if (!ns.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
            if (!mintedTokens.has(baseEventParams.txHash)) {
              mintedTokens.set(baseEventParams.txHash, []);
            }
            mintedTokens.get(baseEventParams.txHash)!.push({
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

          if (ns.mintAddresses.includes(from)) {
            mintInfos.push({
              contract: baseEventParams.address,
              tokenId: tokenIds[i],
              mintedTimestamp: baseEventParams.timestamp,
            });

            if (!ns.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
              if (!mintedTokens.has(baseEventParams.txHash)) {
                mintedTokens.set(baseEventParams.txHash, []);
              }
              mintedTokens.get(baseEventParams.txHash)!.push({
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
    }
  }

  // Handle mints as sales
  for (const [txHash, mints] of mintedTokens.entries()) {
    if (mints.length > 0) {
      const tx = await utils.fetchTransaction(txHash);

      // Skip free mints
      if (tx.value === "0") {
        continue;
      }

      const totalAmount = mints
        .map(({ amount }) => amount)
        .reduce((a, b) => bn(a).add(b).toString());
      if (totalAmount === "0") {
        continue;
      }

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

        const priceData = await getUSDAndNativePrices(
          currency,
          price,
          mint.baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
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
          price: priceData.nativePrice,
          currencyPrice: price,
          usdPrice: priceData.usdPrice,
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

  return {
    fillEvents,
    nftTransferEvents,

    makerInfos,
    mintInfos,
  };
};
