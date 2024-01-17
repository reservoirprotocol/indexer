import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { OrderInfo, getOrderId } from "@/orderbook/orders/palette";

export const offChainCheck = async (
  order: OrderInfo["orderParams"],
  options?: {
    onChainApprovalRecheck?: boolean;
  }
) => {
  const id = getOrderId(order);

  // Fetch latest cancel event
  const cancelResult = await redb.oneOrNone(
    `
      SELECT
        cancel_events.timestamp
      FROM cancel_events
      WHERE cancel_events.order_id = $/orderId/
      ORDER BY cancel_events.timestamp DESC
      LIMIT 1
    `,
    { orderId: id }
  );

  // Fetch latest fill event
  const fillResult = await redb.oneOrNone(
    `
      SELECT
        fill_events_2.timestamp
      FROM fill_events_2
      WHERE fill_events_2.order_id = $/orderId/
      ORDER BY fill_events_2.timestamp DESC
      LIMIT 1
    `,
    { orderId: id }
  );

  // For now, it doesn't matter whether we return "cancelled" or "filled"
  if (cancelResult && cancelResult.timestamp >= order.txTimestamp) {
    throw new Error("cancelled");
  }
  if (fillResult && fillResult.timestamp >= order.txTimestamp) {
    throw new Error("filled");
  }

  let hasBalance = true;
  let hasApproval = true;

  if (order.side === "buy") {
    // No need to check
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.collection,
      order.tokenId!.toString(),
      order.sellerOrBuyer
    );

    if (nftBalance.lt(1)) {
      hasBalance = false;
    }

    const operator = order.orderbook;

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.collection,
      order.sellerOrBuyer,
      operator
    );

    // Re-validate the approval on-chain to handle some edge-cases
    const contract = new Sdk.Common.Helpers.Erc721(baseProvider, order.collection);

    if (!hasBalance) {
      // Fetch token owner on-chain
      const owner = await contract.getOwner(order.tokenId!);
      if (owner.toLocaleLowerCase() === order.sellerOrBuyer) {
        hasBalance = true;
      }
    }

    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        if (!(await contract.isApproved(order.sellerOrBuyer, operator))) {
          hasApproval = false;
        }
      } else {
        hasApproval = false;
      }
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
