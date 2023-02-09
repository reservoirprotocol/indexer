import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import { defaultAbiCoder } from "@ethersproject/abi";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "zeroex-v2-fill": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["makerAddress"].toLowerCase();
        const taker = args["takerAddress"].toLowerCase();
        let amount = "";
        let tokenContract = "";
        let tokenId = "";
        let currency = "";
        let currencyPrice = "";

        const MultiAssetProxy = "0x94cfcdd7";
        const ERC20Proxy = "0xf47261b0";
        const ERC721Proxy = "0x02571792";

        if (
          args["takerAssetData"].slice(0, 10) !== MultiAssetProxy ||
          args["makerAssetData"].slice(0, 10) !== MultiAssetProxy
        ) {
          break;
        }

        const takerAssetData = defaultAbiCoder.decode(
          ["uint256[]", "bytes[]"],
          args["takerAssetData"].replace(MultiAssetProxy, "0x")
        );
        const makerAssetData = defaultAbiCoder.decode(
          ["uint256[]", "bytes[]"],
          args["makerAssetData"].replace(MultiAssetProxy, "0x")
        );

        if (makerAssetData[1].length !== 1 || takerAssetData[1].length !== 1) {
          break;
        }

        const makerAssetType = makerAssetData[1][0].slice(0, 10);
        const takerAssetType = takerAssetData[1][0].slice(0, 10);

        if (
          MultiAssetProxy in [makerAssetType, takerAssetType] ||
          makerAssetType === takerAssetType
        ) {
          break;
        }

        const orderSide = makerAssetType === ERC20Proxy ? "buy" : "sell";

        // Decode taker asset data
        let decodedTakerAssetData = null;
        if (takerAssetType === ERC721Proxy) {
          decodedTakerAssetData = defaultAbiCoder.decode(
            ["address", "uint256"],
            takerAssetData[1][0].replace(ERC721Proxy, "0x")
          );
        } else {
          decodedTakerAssetData = defaultAbiCoder.decode(
            ["address"],
            takerAssetData[1][0].replace(ERC20Proxy, "0x")
          );
        }

        // Decode maker asset data
        let decodedMakerAssetData = null;
        if (makerAssetType === ERC721Proxy) {
          decodedMakerAssetData = defaultAbiCoder.decode(
            ["address", "uint256"],
            makerAssetData[1][0].replace(ERC721Proxy, "0x")
          );
        } else {
          decodedMakerAssetData = defaultAbiCoder.decode(
            ["address"],
            makerAssetData[1][0].replace(ERC20Proxy, "0x")
          );
        }

        currency = orderSide === "sell" ? decodedTakerAssetData[0] : decodedMakerAssetData[0];
        currencyPrice = orderSide === "sell" ? takerAssetData[0][0] : makerAssetData[0][0];
        amount = orderSide === "sell" ? makerAssetData[0][0] : takerAssetData[0][0];
        tokenContract = orderSide === "sell" ? decodedMakerAssetData[0] : decodedTakerAssetData[0];
        tokenId = orderSide === "sell" ? decodedMakerAssetData[1] : decodedTakerAssetData[1];

        if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Eth[config.chainId];
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

        const orderKind = "zeroex-v2";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEvents.push({
          orderKind,
          currency,
          orderSide,
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

        onChainData.fillInfos.push({
          context: `zeroex-v2-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
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
};
