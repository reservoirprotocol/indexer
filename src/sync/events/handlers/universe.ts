//TODO: Add Universe
import { defaultAbiCoder } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import { config } from "@/config/index";
import { bn } from "@/common/utils";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEvents: es.cancels.Event[] = [];
  const fillEvents: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "universe-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const orderId = args["hash"].toLowerCase();

        cancelEvents.push({
          orderKind: "universe",
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
      case "universe-match": {
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

        const orderKind = "universe";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind, {
          orderId: leftHash,
        });
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
          currency.toLowerCase(),
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEvents.push({
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
    }
  }

  return {
    cancelEvents,
    fillEvents,

    fillInfos,
    orderInfos,
    makerInfos,
  };
};
