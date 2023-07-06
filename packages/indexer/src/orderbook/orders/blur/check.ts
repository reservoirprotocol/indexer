import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: Sdk.Blur.Order,
  originatedAt?: string,
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
  const kind = await commonHelpers.getContractKind(order.params.collection);

  if (!kind || kind !== order.params.kind?.split("-")[0]) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, "blur");
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(order.params.amount ?? 1)) {
      throw new Error("filled");
    }

    if (order.params.side === Sdk.Blur.Types.TradeDirection.SELL && originatedAt) {
      // Check: order is not off-chain cancelled
      const offChainCancelled = await commonHelpers.isListingOffChainCancelled(
        order.params.trader,
        order.params.collection,
        order.params.tokenId,
        Sdk.Blur.Addresses.ExecutionDelegate[config.chainId],
        originatedAt
      );
      if (offChainCancelled) {
        throw new Error("cancelled");
      }
    }
  }

  // Check: order has a valid nonce
  const minNonce = await commonHelpers.getMinNonce("blur", order.params.trader);
  if (!minNonce.eq(order.params.nonce)) {
    throw new Error("cancelled");
  }

  let hasBalance = true;
  let hasApproval = true;
  if (order.params.side === Sdk.Blur.Types.TradeDirection.BUY) {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(
      order.params.paymentToken,
      order.params.trader
    );
    if (ftBalance.lt(bn(order.params.price))) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.params.paymentToken,
              order.params.trader,
              Sdk.Blur.Addresses.ExecutionDelegate[config.chainId]
            )
            .then((a) => a.value)
        ).lt(bn(order.params.price))
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.params.collection,
      order.params.tokenId,
      order.params.trader
    );

    if (nftBalance.lt(order.params.amount ?? 1)) {
      hasBalance = false;
    }

    const operator = Sdk.Blur.Addresses.ExecutionDelegate[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.params.collection,
      order.params.trader,
      operator
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          kind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.collection)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.collection);
        if (!(await contract.isApproved(order.params.trader, operator))) {
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
