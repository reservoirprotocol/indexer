import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { OrderInfo } from "@/orderbook/orders/manifold";

export const offChainCheck = async (order: OrderInfo["orderParams"]) => {
  const exchangeContract = new Sdk.Manifold.Exchange(config.chainId);
  const onChainListing = await exchangeContract.getListing(baseProvider, order.id);

  if (bn(onChainListing.id).toString() != order.id) {
    throw Error("invalid");
  }

  if (onChainListing.details.type_ != order.details.type_) {
    throw Error("invalid");
  }

  if (onChainListing.finalized) {
    throw Error("not-fillable");
  }

  if (
    onChainListing.details.startTime != order.details.startTime ||
    onChainListing.details.endTime != order.details.endTime
  ) {
    throw Error("invalid");
  }

  if (onChainListing.details.erc20.toLowerCase() != order.details.erc20) {
    throw Error("invalid");
  }

  if (bn(onChainListing.details.initialAmount).toString() != order.details.initialAmount) {
    throw Error("invalid");
  }

  if (onChainListing.details.totalAvailable != order.details.totalAvailable) {
    throw Error("invalid");
  }

  if (onChainListing.details.totalPerSale != order.details.totalPerSale) {
    throw Error("invalid");
  }
};
