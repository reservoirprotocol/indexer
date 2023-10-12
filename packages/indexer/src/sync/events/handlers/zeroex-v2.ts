import { Result, defaultAbiCoder } from "@ethersproject/abi";
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
      case "zeroex-v2-fill": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["makerAddress"].toLowerCase();
        const taker = args["takerAddress"].toLowerCase();

        const MultiAssetProxy = "0x94cfcdd7";
        const ERC20Proxy = "0xf47261b0";
        const ERC721Proxy = "0x02571792";
        const ERC1155Proxy = "0xa7cb5fb7";

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
        let decodedTakerAssetData: Result;
        if (takerAssetType === ERC721Proxy) {
          decodedTakerAssetData = defaultAbiCoder.decode(
            ["address", "uint256"],
            takerAssetData[1][0].replace(ERC721Proxy, "0x")
          );
        } else if (takerAssetType === ERC1155Proxy) {
          decodedTakerAssetData = defaultAbiCoder.decode(
            ["address", "uint256[]", "uint256[]", "bytes"],
            takerAssetData[1][0].replace(ERC1155Proxy, "0x")
          );
          if (decodedTakerAssetData[1].length !== 1) {
            break;
          }
        } else {
          decodedTakerAssetData = defaultAbiCoder.decode(
            ["address"],
            takerAssetData[1][0].replace(ERC20Proxy, "0x")
          );
        }

        // Decode maker asset data
        let decodedMakerAssetData: Result;
        if (makerAssetType === ERC721Proxy) {
          decodedMakerAssetData = defaultAbiCoder.decode(
            ["address", "uint256"],
            makerAssetData[1][0].replace(ERC721Proxy, "0x")
          );
        } else if (makerAssetType === ERC1155Proxy) {
          decodedMakerAssetData = defaultAbiCoder.decode(
            ["address", "uint256[]", "uint256[]", "bytes"],
            makerAssetData[1][0].replace(ERC1155Proxy, "0x")
          );
          if (decodedMakerAssetData[1].length !== 1) {
            break;
          }
        } else {
          decodedMakerAssetData = defaultAbiCoder.decode(
            ["address"],
            makerAssetData[1][0].replace(ERC20Proxy, "0x")
          );
        }

        const tokenContract =
          orderSide === "sell" ? decodedMakerAssetData[0] : decodedTakerAssetData[0];
        const amount =
          orderSide === "sell"
            ? makerAssetType === ERC1155Proxy
              ? decodedMakerAssetData[2][0].toString()
              : makerAssetData[0][0].toString()
            : takerAssetType === ERC1155Proxy
            ? decodedTakerAssetData[2].toString()
            : takerAssetData[0][0].toString();
        const tokenId =
          orderSide === "sell"
            ? makerAssetType === ERC1155Proxy
              ? decodedMakerAssetData[1][0].toString()
              : decodedMakerAssetData[1].toString()
            : takerAssetType === ERC1155Proxy
            ? decodedTakerAssetData[1][0].toString()
            : decodedTakerAssetData[1].toString();
        let currency = orderSide === "sell" ? decodedTakerAssetData[0] : decodedMakerAssetData[0];
        if (currency === Sdk.ZeroExV4.Addresses.Native[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Native[config.chainId];
        }

        let currencyPrice = orderSide === "sell" ? takerAssetData[0][0] : makerAssetData[0][0];
        currencyPrice = bn(currencyPrice).div(amount).toString();

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
          currencyPrice: currencyPrice.toString(),
          usdPrice: priceData.usdPrice,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `zeroex-v2-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }
    }
  }
};
