import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: Sdk.LooksRareV2.Order,
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
    const cancelled = await commonHelpers.isOrderCancelled(id, "looks-rare-v2");
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(order.params.amounts[0])) {
      throw new Error("filled");
    }
  }

  // Check: order's nonce was not bulk cancelled
  const side = order.params.quoteType === Sdk.LooksRareV2.Types.QuoteType.Ask ? "sell" : "buy";
  const minNonce = await commonHelpers.getMinNonce("looks-rare-v2", order.params.signer, side);

  if (minNonce.gt(order.params.globalNonce)) {
    throw new Error("cancelled");
  }

  // Check: order's subsetNonce was not individually cancelled
  const subsetNonceCancelled = await commonHelpers.isSubsetNonceCancelled(
    order.params.signer,
    order.params.subsetNonce
  );

  if (subsetNonceCancelled) {
    throw new Error("cancelled");
  }

  // Check: order's nonce was not individually cancelled
  const nonceCancelled = await commonHelpers.isNonceCancelled(
    "looks-rare-v2",
    order.params.signer,
    order.params.orderNonce
  );

  if (nonceCancelled) {
    throw new Error("cancelled");
  }

  let hasBalance = true;
  let hasApproval = true;
  if (order.params.quoteType !== Sdk.LooksRareV2.Types.QuoteType.Ask) {
    // Handle rebasing tokens (where applicable)
    await onChainData.updateFtBalance(order.params.currency, order.params.signer);

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
              Sdk.LooksRareV2.Addresses.Exchange[config.chainId],
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
      order.params.itemIds[0],
      order.params.signer
    );
    if (nftBalance.lt(1)) {
      hasBalance = false;
    }

    const operator = Sdk.LooksRareV2.Addresses.TransferManager[config.chainId];

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
