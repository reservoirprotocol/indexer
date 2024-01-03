import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

export const offChainCheck = async (
  order: Sdk.Hotpot.Order,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid.
    onChainApprovalRecheck?: boolean;
    checkFilledOrCancelled?: boolean;
  }
) => {
  const id = order.hash();

  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(order.params.offerItem.offerToken);
  if (!kind) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, "hotpot");
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(order.params.offerItem.amount)) {
      throw new Error("filled");
    }
  }

  // Check NFT balance and approval; (only sell side)
  let hasBalance;
  let hasApproval;
  const collection = order.params.offerItem.offerToken;

  const nftBalance = await commonHelpers.getNftBalance(
    collection,
    order.params.offerItem.offerTokenId,
    order.params.offerer
  );

  if (nftBalance.lt(order.params.offerItem.amount)) {
    hasBalance = false;
  }

  const exchange = Sdk.Hotpot.Addresses.Exchange[config.chainId];

  // Check: maker has set the proper approval
  const nftApproval = await commonHelpers.getNftApproval(
    collection,
    order.params.offerer,
    exchange
  );
  if (!nftApproval) {
    if (options?.onChainApprovalRecheck) {
      // Re-validate the approval on-chain to handle some edge-cases
      const contract =
        kind === "erc721"
          ? new Sdk.Common.Helpers.Erc721(baseProvider, collection)
          : new Sdk.Common.Helpers.Erc1155(baseProvider, collection);
      if (!(await contract.isApproved(order.params.offerer, exchange))) {
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
