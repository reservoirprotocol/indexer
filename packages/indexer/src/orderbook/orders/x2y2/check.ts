import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: Sdk.X2Y2.Order,
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
  const id = order.params.itemHash;

  const isERC721 = order.params.delegateType === Sdk.X2Y2.Types.DelegationType.ERC721;
  const operator = isERC721
    ? Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId]
    : Sdk.X2Y2.Addresses.Erc1155Delegate[config.chainId];

  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(order.params.nft.token);
  if (!kind) {
    throw new Error("invalid-target");
  }
  if (!["erc1155", "erc721", "erc721-like"].includes(kind)) {
    throw new Error("invalid-target");
  }
  if (["erc1155"].includes(kind) && isERC721) {
    throw new Error("invalid-target");
  }
  if (["erc721", "erc721-like"].includes(kind) && !isERC721) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, "x2y2");
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(1)) {
      throw new Error("filled");
    }

    if (order.params.type === "sell" && originatedAt) {
      // Check: order is not off-chain cancelled
      const offChainCancelled = await commonHelpers.isListingOffChainCancelled(
        order.params.maker,
        order.params.nft.token,
        order.params.nft.tokenId!,
        operator,
        originatedAt
      );
      if (offChainCancelled) {
        throw new Error("cancelled");
      }
    }
  }

  let hasBalance = true;
  let hasApproval = true;
  if (order.params.type === "buy") {
    // Handle rebasing tokens (where applicable)
    await onChainData.updateFtBalance(order.params.currency, order.params.maker);

    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(order.params.currency, order.params.maker);
    if (ftBalance.lt(order.params.price)) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.params.currency,
              order.params.maker,
              Sdk.X2Y2.Addresses.Exchange[config.chainId],
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
      order.params.nft.token,
      order.params.nft.tokenId!,
      order.params.maker
    );
    if (nftBalance.lt(1)) {
      hasBalance = false;
    }

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.params.nft.token,
      order.params.maker,
      operator
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          kind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.nft.token)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.nft.token);
        if (!(await contract.isApproved(order.params.maker, operator))) {
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
