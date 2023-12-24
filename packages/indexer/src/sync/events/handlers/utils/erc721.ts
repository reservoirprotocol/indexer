import * as utils from "@/events-sync/utils";
import { bn } from "@/common/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getOrderSourceByOrderKind } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";
import { BaseEventParams } from "@/events-sync/parser";
import { OnChainData } from "@/events-sync/handlers/utils/index";

// Handle mints as sales
export const handleMints = async (
  mintedTokens: Map<
    string,
    {
      contract: string;
      from: string;
      to: string;
      tokenId: string;
      amount: string;
      baseEventParams: BaseEventParams;
    }[]
  >,
  onChainData: OnChainData
) => {
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
