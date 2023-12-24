import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { BaseEventParams } from "@/events-sync/parser";
import * as utils from "@/events-sync/utils";
import { getOrderSourceByOrderKind } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For handling mints as sales
  const mintedTokens = new Map<
    string,
    {
      contract: string;
      from: string;
      to: string;
      tokenId: string;
      amount: string;
      baseEventParams: BaseEventParams;
    }[]
  >();

  // Cache the network settings
  const ns = getNetworkSettings();

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "erc1155-transfer-single": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();

        onChainData.nftTransferEvents.push({
          kind: "erc1155",
          from,
          to,
          tokenId,
          amount,
          baseEventParams,
        });

        // Make sure to only handle the same data once per transaction
        const contextPrefix = `${baseEventParams.txHash}-${baseEventParams.address}-${tokenId}`;

        onChainData.makerInfos.push({
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

        onChainData.makerInfos.push({
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
          onChainData.mintInfos.push({
            contract: baseEventParams.address,
            tokenId,
            mintedTimestamp: baseEventParams.timestamp,
          });
          onChainData.mints.push({
            by: "tx",
            data: {
              txHash: baseEventParams.txHash,
            },
          });

          if (!ns.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
            if (!mintedTokens.has(baseEventParams.txHash)) {
              mintedTokens.set(baseEventParams.txHash, []);
            }
            mintedTokens.get(baseEventParams.txHash)!.push({
              contract: baseEventParams.address,
              tokenId,
              from,
              to,
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
          onChainData.nftTransferEvents.push({
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

          onChainData.makerInfos.push({
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

          onChainData.makerInfos.push({
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
            onChainData.mintInfos.push({
              contract: baseEventParams.address,
              tokenId: tokenIds[i],
              mintedTimestamp: baseEventParams.timestamp,
            });
            onChainData.mints.push({
              by: "tx",
              data: {
                txHash: baseEventParams.txHash,
              },
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
                to,
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
      const currency = Sdk.Common.Addresses.Native[config.chainId];

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

        onChainData.fillEvents.push({
          orderKind,
          orderSide: "sell",
          taker: mint.to,
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
};
