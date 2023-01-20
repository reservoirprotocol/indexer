import { defaultAbiCoder } from "@ethersproject/abi";
import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, kind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind ?? kind])[0];
    switch (subKind) {
      case "universe-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const orderId = args["hash"].toLowerCase();

        onChainData.cancelEvents.push({
          orderKind: "universe",
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

        onChainData.fillEvents.push({
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

        onChainData.fillInfos.push({
          context: leftHash,
          orderId: leftHash,
          orderSide: side,
          contract,
          tokenId,
          amount,
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker: leftMaker,
          taker,
        });

        break;
      }
    }
  }
};
