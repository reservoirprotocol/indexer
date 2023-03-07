import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: Sdk.LooksRare.Order,
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
  if (!kind) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, "looks-rare");
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
  const minNonce = await commonHelpers.getMinNonce("looks-rare", order.params.signer);
  if (minNonce.gt(order.params.nonce)) {
    throw new Error("cancelled");
  }

  // Check: order's nonce was not individually cancelled
  const nonceCancelled = await commonHelpers.isNonceCancelled(
    "looks-rare",
    order.params.signer,
    order.params.nonce
  );
  if (nonceCancelled) {
    throw new Error("cancelled");
  }

  let hasBalance = true;
  let hasApproval = true;
  if (!order.params.isOrderAsk) {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(order.params.currency, order.params.signer);
    if (ftBalance.lt(order.params.price)) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.params.currency,
              order.params.signer,
              Sdk.LooksRare.Addresses.Exchange[config.chainId],
              true
            )
            .then((a) => a.value)
        ).lt(order.params.price)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.params.collection,
      order.params.tokenId,
      order.params.signer
    );
    if (nftBalance.lt(1)) {
      hasBalance = false;
    }

    const operator =
      kind === "erc721"
        ? Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]
        : Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.params.collection,
      order.params.signer,
      operator
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          kind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.collection)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.collection);
        if (!(await contract.isApproved(order.params.signer, operator))) {
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
