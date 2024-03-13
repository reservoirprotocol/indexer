import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";
import { defaultAbiCoder, keccak256 } from "ethers/lib/utils";

export const offChainCheck = async (
  order: Sdk.Element.Order,
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
  // TODO: We should also check the remaining quantity for partially filled orders.

  const id = keccak256(
    defaultAbiCoder.encode(["bytes32", "uint256"], [order.hash(), order.params.nonce])
  );

  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(order.params.nft!);
  if (!kind || kind !== order.contractKind()) {
    throw new Error("invalid-target");
  }

  const orderKind = kind === "erc1155" ? "element-erc1155" : "element-erc721";

  const nftAmount =
    kind === "erc721" ? "1" : (order.params as Sdk.Element.Types.BaseOrder).nftAmount!;
  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, orderKind);
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(nftAmount)) {
      throw new Error("filled");
    }
  }

  // Check: order's nonce was not individually cancelled
  const nonceCancelled = await commonHelpers.isNonceCancelled(
    orderKind,
    order.params.maker,
    order.params.nonce!.toString()
  );
  if (nonceCancelled) {
    throw new Error("cancelled");
  }

  let hasBalance = true;
  let hasApproval = true;
  if (order.side() === "buy") {
    // Check: maker has enough balance
    const price = order.getTotalPrice();

    // Handle rebasing tokens (where applicable)
    await onChainData.updateFtBalance(order.params.erc20Token, order.params.maker);

    const ftBalance = await commonHelpers.getFtBalance(order.params.erc20Token, order.params.maker);
    if (ftBalance.lt(price)) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.params.erc20Token,
              order.params.maker,
              Sdk.Element.Addresses.Exchange[config.chainId],
              true
            )
            .then((a) => a.value)
        ).lt(price)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.params.nft!,
      order.params.nftId!,
      order.params.maker
    );

    if (nftBalance.lt(nftAmount)) {
      hasBalance = false;
    }

    const operator = Sdk.Element.Addresses.Exchange[config.chainId];

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      order.params.nft!,
      order.params.maker,
      operator
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          kind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.nft!)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.nft!);
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
