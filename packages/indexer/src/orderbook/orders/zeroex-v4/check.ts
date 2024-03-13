import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";

export const offChainCheck = async (
  order: Sdk.ZeroExV4.Order,
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
  // TODO: We should also check the remaining quantity for partially filled orders

  const id = order.hash();

  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(order.params.nft);
  if (!kind || kind !== order.params.kind?.split("-")[0]) {
    throw new Error("invalid-target");
  }

  const orderKind = kind === "erc1155" ? "zeroex-v4-erc1155" : "zeroex-v4-erc721";

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, orderKind);
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(order.params.nftAmount ?? 1)) {
      throw new Error("filled");
    }
  }

  // Check: order's nonce was not individually cancelled
  const nonceCancelled = await commonHelpers.isNonceCancelled(
    orderKind,
    order.params.maker,
    order.params.nonce
  );
  if (nonceCancelled) {
    throw new Error("cancelled");
  }

  const feeAmount = order.getFeeAmount();

  let hasBalance = true;
  let hasApproval = true;
  if (order.params.direction === Sdk.ZeroExV4.Types.TradeDirection.BUY) {
    // Handle rebasing tokens (where applicable)
    await onChainData.updateFtBalance(order.params.erc20Token, order.params.maker);

    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(order.params.erc20Token, order.params.maker);
    if (ftBalance.lt(bn(order.params.erc20TokenAmount).add(feeAmount))) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.params.erc20Token,
              order.params.maker,
              Sdk.ZeroExV4.Addresses.Exchange[config.chainId],
              true
            )
            .then((a) => a.value)
        ).lt(bn(order.params.erc20TokenAmount).add(feeAmount))
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.params.nft,
      order.params.nftId,
      order.params.maker
    );
    if (nftBalance.lt(order.params.nftAmount ?? 1)) {
      hasBalance = false;
    }

    const operator = Sdk.ZeroExV4.Addresses.Exchange[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.params.nft,
      order.params.maker,
      operator
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          kind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.nft)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.nft);
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
