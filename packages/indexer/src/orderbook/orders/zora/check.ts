import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { OrderInfo, getOrderId } from "@/orderbook/orders/zora";
import * as onChainData from "@/utils/on-chain-data";

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
    // Handle rebasing tokens (where applicable)
    await onChainData.updateFtBalance(order.askCurrency, order.maker);

    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(order.askCurrency, order.maker);
    if (ftBalance.lt(order.askPrice)) {
      hasBalance = true;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.askCurrency,
              order.maker,
              Sdk.Zora.Addresses.Erc20TransferHelper[config.chainId]
            )
            .then((a) => a.value)
        ).lt(order.askPrice)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.tokenContract,
      order.tokenId.toString(),
      order.seller
    );

    if (nftBalance.lt(1)) {
      hasBalance = false;
    }

    const operator = Sdk.Zora.Addresses.Erc721TransferHelper[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.tokenContract,
      order.seller,
      operator
    );

    // Re-validate the approval on-chain to handle some edge-cases
    const contract = new Sdk.Common.Helpers.Erc721(baseProvider, order.tokenContract);

    if (!hasBalance) {
      // Fetch token owner on-chain
      const owner = await contract.getOwner(order.tokenId);
      if (owner.toLocaleLowerCase() === order.seller) {
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
  }

  if (!hasBalance && !hasApproval) {
    throw new Error("no-balance-no-approval");
  } else if (!hasBalance) {
    throw new Error("no-balance");
  } else if (!hasApproval) {
    throw new Error("no-approval");
  }
};
