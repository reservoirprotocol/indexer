import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { OrderInfo } from "@/orderbook/orders/manifold";

export const offChainCheck = async (
  order: OrderInfo["orderParams"],
  options?: {
    onChainApprovalRecheck?: boolean;
  }
) => {
  // const id = getOrderId(order);

  // // Fetch latest cancel event
  // const cancelResult = await redb.oneOrNone(
  //   `
  //     SELECT
  //       cancel_events.timestamp
  //     FROM cancel_events
  //     WHERE cancel_events.order_id = $/orderId/
  //     ORDER BY cancel_events.timestamp DESC
  //     LIMIT 1
  //   `,
  //   { orderId: id }
  // );

  // // Fetch latest fill event
  // const fillResult = await redb.oneOrNone(
  //   `
  //     SELECT
  //       fill_events_2.timestamp
  //     FROM fill_events_2
  //     WHERE fill_events_2.order_id = $/orderId/
  //     ORDER BY fill_events_2.timestamp DESC
  //     LIMIT 1
  //   `,
  //   { orderId: id }
  // );

  let hasBalance = true;
  let hasApproval = true;

  // Check: maker has enough balance
  const nftBalance = await commonHelpers.getNftBalance(
    order.token.address_,
    order.token.id.toString(),
    order.seller
  );

  if (nftBalance.lt(1)) {
    hasBalance = false;
  }

  const operator = Sdk.Manifold.Addresses.Exchange[config.chainId];

  // Check: maker has set the proper approval
  const nftApproval = await commonHelpers.getNftApproval(
    order.token.address_,
    order.seller,
    operator
  );

  // Re-validate the approval on-chain to handle some edge-cases
  const contract = new Sdk.Common.Helpers.Erc721(baseProvider, order.token.address_);
  if (!hasBalance) {
    // Fetch token owner on-chain
    const owner = await contract.getOwner(order.token.id);
    if (owner.toLowerCase() === order.seller) {
      hasBalance = true;
    }
  }

  if (!nftApproval) {
    if (options?.onChainApprovalRecheck) {
      if (!(await contract.isApproved(order.seller, operator))) {
        hasApproval = false;
      }
    } else {
      hasApproval = false;
    }
  }

  if (!hasBalance && !hasApproval) {
    throw new Error("no-balance-no-approval");
  } else if (!hasBalance) {
    throw new Error("no-balance");
  } else if (!hasApproval) {
    throw new Error("no-approval");
  }
};
