import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { parseCallTrace } from "@georgeroman/evm-tx-simulator";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as es from "@/events-sync/storage";
import { bn } from "@/common/utils";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const fillEvents: es.fills.Event[] = [];
  const fillInfos: fillUpdates.FillInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "nft-trader-swap": {
        const { args } = eventData.abi.parseLog(log);
        const status = args["status"];
        const taker = args["creator"].toLowerCase();
        const orderId = args["swapId"];

        //statuses:
        // 0 - opened
        // 1 - closed
        // 2 - canceled
        if (status !== 1) {
          break;
        }

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const parsedTrace = parseCallTrace(txTrace.calls);

        let tokenCounterA = 0;
        let tokenCounterB = 0;
        let addressesCounter = 0;
        let tokenId = "";
        let tokenContract = "";
        let currency = "";
        let currencyPrice = "";
        let maker = "";

        // {
        //   '0x24deb03382400c993819df42f5adcf897f4f66b3': {
        //     tokenBalanceState: {
        //       'native:0x0000000000000000000000000000000000000000': '253700000000000000',
        //       'erc721:0x64a1c0937728d8d2fa8cd81ef61a9c860b7362db:506': '1',
        //       'erc721:0x64a1c0937728d8d2fa8cd81ef61a9c860b7362db:2140': '-1'
        //     }
        //   },
        //   '0x657e383edb9a7407e468acbcc9fe4c9730c7c275': {
        //     tokenBalanceState: {
        //       'native:0x0000000000000000000000000000000000000000': '-265000000000000000'
        //     }
        //   },
        //   '0xfe20d3b9419d37bc1a9c65fdd0a66109fffd5f43': {
        //     tokenBalanceState: {
        //       'erc721:0x64a1c0937728d8d2fa8cd81ef61a9c860b7362db:506': '-1',
        //       'erc721:0x64a1c0937728d8d2fa8cd81ef61a9c860b7362db:2140': '1'
        //     }
        //   },
        //   '0x83db44123e76503203fdf83d2be58be60c15b894': {
        //     tokenBalanceState: {
        //       'native:0x0000000000000000000000000000000000000000': '11300000000000000'
        //     }
        //   }
        // }

        // {
        //   "0x10a89eacfc556e4f943050eafc350d3c1122836a": {
        //     tokenBalanceState: {
        //       "native:0x0000000000000000000000000000000000000000": "-3805000000000000000",
        //       "erc721:0x231d3559aa848bf10366fb9868590f01d34bf240:1475": "1",
        //     },
        //   },
        //   "0x657e383edb9a7407e468acbcc9fe4c9730c7c275": {
        //     tokenBalanceState: {
        //       "native:0x0000000000000000000000000000000000000000": "-5000000000000000",
        //     },
        //   },
        //   "0xce9f867f70d1db3a37db2cda0d0eec099020f695": {
        //     tokenBalanceState: {
        //       "erc721:0x231d3559aa848bf10366fb9868590f01d34bf240:1475": "-1",
        //       "native:0x0000000000000000000000000000000000000000": "3781000000000000000",
        //     },
        //   },
        //   "0x83db44123e76503203fdf83d2be58be60c15b894": {
        //     tokenBalanceState: {
        //       "native:0x0000000000000000000000000000000000000000": "29000000000000000",
        //     },
        //   },
        // }

        let transferToken = "";
        let amount = "0";
        let currencyType = "";
        for (const token of Object.keys(parsedTrace[taker].tokenBalanceState)) {
          if (token.startsWith("erc721") || token.startsWith("erc1155")) {
            transferToken = token;

            amount = parsedTrace[taker].tokenBalanceState[token];
          } else if (token.startsWith("erc20") || token.startsWith("native")) {
            currency = token.split(":")[1];
            currencyType = token;
          }
        }

        for (const address of Object.keys(parsedTrace)) {
          if (address === baseEventParams.address) {
            continue;
          }

          for (const token of Object.keys(parsedTrace[address].tokenBalanceState)) {
            if (token.startsWith("erc721") || token.startsWith("erc1155")) {
              addressesCounter === 0 ? tokenCounterA++ : tokenCounterB++;
              addressesCounter++;

              if (address !== taker && token === transferToken) {
                maker = address;
              }

              [, tokenContract, tokenId] = token.split(":");
            }
          }
        }

        //we don't support token for token exchange
        //we don't support bundles
        if ((tokenCounterA && tokenCounterB) || tokenCounterA > 1 || tokenCounterB > 1) {
          break;
        }

        if (bn(amount).gt(0)) {
          currencyPrice = bn(parsedTrace[taker].tokenBalanceState[currencyType])
            .add(bn(parsedTrace[baseEventParams.address].tokenBalanceState[currencyType]))
            .toString();
        } else {
          currencyPrice = bn(parsedTrace[maker].tokenBalanceState[currencyType])
            .add(bn(parsedTrace[baseEventParams.address].tokenBalanceState[currencyType]))
            .toString();
        }

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "nft-trader";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        // break;
        fillEvents.push({
          orderKind,
          currency,
          orderSide: bn(amount).gt(0) ? "sell" : "buy",
          maker,
          taker,
          price: priceData.nativePrice,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: tokenContract,
          tokenId,
          amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `nft-trader-${tokenContract}-${tokenId}-${orderId}-${baseEventParams.txHash}`,
          orderSide: "buy",
          contract: tokenContract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }
    }
  }

  return {
    fillEvents,
    fillInfos,
  };
};
