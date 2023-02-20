import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: Sdk.Forward.Order,
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
  const kind = await commonHelpers.getContractKind(order.params.token);
  if (!kind) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id);
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(order.params.amount)) {
      throw new Error("filled");
    }
  }

  // Check: order's nonce was not bulk cancelled
  const minNonce = await commonHelpers.getMinNonce("forward", order.params.maker);
  if (minNonce.gt(order.params.counter)) {
    throw new Error("cancelled");
  }

  let hasBalance = true;
  let hasApproval = true;

  const totalPrice = bn(order.params.unitPrice).mul(order.params.amount);

  // Check: maker has enough balance
  const ftBalance = await commonHelpers.getFtBalance(
    Sdk.Common.Addresses.Weth[config.chainId],
    order.params.maker
  );
  if (ftBalance.lt(totalPrice)) {
    hasBalance = false;
  }

  if (options?.onChainApprovalRecheck) {
    if (
      bn(
        await onChainData
          .fetchAndUpdateFtApproval(
            Sdk.Common.Addresses.Weth[config.chainId],
            order.params.maker,
            Sdk.Forward.Addresses.Exchange[config.chainId],
            true
          )
          .then((a) => a.value)
      ).lt(totalPrice)
    ) {
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
