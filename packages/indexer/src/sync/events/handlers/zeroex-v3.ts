import { defaultAbiCoder } from "@ethersproject/abi";
import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "zeroex-v3-fill": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["makerAddress"].toLowerCase();
        const taker = args["takerAddress"].toLowerCase();
        const makerAssetData = args["makerAssetData"].toLowerCase();
        const takerAssetData = args["takerAssetData"].toLowerCase();
        const makerAssetFilledAmount = args["makerAssetFilledAmount"].toString();
        const takerAssetFilledAmount = args["takerAssetFilledAmount"].toString();

        const ERC20Proxy = "0xf47261b0";
        const ERC721Proxy = "0x02571792";
        const ERC1155Proxy = "0xa7cb5fb7";

        const makerAssetType = makerAssetData.slice(0, 10);
        const takerAssetType = takerAssetData.slice(0, 10);

        if (![ERC20Proxy, ERC721Proxy, ERC1155Proxy].includes(makerAssetType)) {
          break;
        }
        if (![ERC20Proxy, ERC721Proxy, ERC1155Proxy].includes(takerAssetType)) {
          break;
        }

        const orderSide = makerAssetType === ERC20Proxy ? "buy" : "sell";
        if (orderSide === "sell" && ![ERC20Proxy].includes(takerAssetType)) {
          break;
        }
        if (orderSide === "buy" && ![ERC721Proxy, ERC1155Proxy].includes(takerAssetType)) {
          break;
        }

        let contract: string;
        let tokenId: string;
        let amount: string;

        const nftData = orderSide === "sell" ? makerAssetData : takerAssetData;
        if (nftData.startsWith(ERC721Proxy)) {
          const decodedNftData = defaultAbiCoder.decode(
            ["address", "uint256"],
            nftData.replace(ERC721Proxy, "0x")
          );

          contract = decodedNftData[0].toLowerCase();
          tokenId = decodedNftData[1].toString();
          amount = "1";
        } else {
          const decodedNftData = defaultAbiCoder.decode(
            ["address", "uint256[]", "uint256[]"],
            nftData.replace(ERC1155Proxy, "0x")
          );
          if (decodedNftData[1].length > 1 || decodedNftData[2].length > 1) {
            break;
          }

          contract = decodedNftData[0].toLowerCase();
          tokenId = decodedNftData[1][0].toString();
          amount = decodedNftData[2][0].toString();
        }

        const ftData = orderSide === "buy" ? makerAssetData : takerAssetData;
        const decodedFtData = defaultAbiCoder.decode(["address"], ftData.replace(ERC20Proxy, "0x"));

        let currency = decodedFtData[0].toLowerCase();
        if (currency === Sdk.ZeroExV4.Addresses.Native[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Native[config.chainId];
        }

        const currencyPrice =
          orderSide === "buy"
            ? bn(makerAssetFilledAmount).div(takerAssetFilledAmount).toString()
            : bn(takerAssetFilledAmount).div(makerAssetFilledAmount).toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "zeroex-v3";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        // Check the previous fill event for a match (to cover OpenSea's usage of 0x v3)
        const matchingFillEventIndex = onChainData.fillEvents.findIndex((c) => {
          return (
            c.contract === contract &&
            c.tokenId === tokenId &&
            c.baseEventParams.logIndex === baseEventParams.logIndex - 1
          );
        });

        if (matchingFillEventIndex === -1) {
          onChainData.fillEvents.push({
            orderKind,
            currency,
            orderSide,
            maker,
            taker,
            price: priceData.nativePrice,
            currencyPrice: currencyPrice.toString(),
            usdPrice: priceData.usdPrice,
            contract,
            tokenId: tokenId.toString(),
            amount: amount.toString(),
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });
        } else {
          // Merge with the previous fill event
          const matchingFillEvent = onChainData.fillEvents[matchingFillEventIndex];
          matchingFillEvent.taker = maker;

          onChainData.fillInfos.push({
            context: `zeroex-v3-${contract}-${tokenId}-${baseEventParams.txHash}`,
            orderSide,
            contract,
            tokenId: tokenId.toString(),
            amount: amount.toString(),
            price: priceData.nativePrice,
            timestamp: baseEventParams.timestamp,
            maker,
            taker,
          });
        }

        break;
      }
    }
  }
};
