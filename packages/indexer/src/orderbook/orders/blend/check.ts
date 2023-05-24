import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

export const offChainCheck = async (
  order: Sdk.Blend.Order,
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

  if (!order.params.lien) {
    throw new Error("invalid");
  }

  // Check: order has a valid target
  const kind = await commonHelpers.getContractKind(order.params.lien.collection);

  if (!kind) {
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
    if (quantityFilled.gte(order.params.lien.amount)) {
      throw new Error("filled");
    }
  }

  // Check: order has a valid nonce
  const minNonce = await commonHelpers.getMinNonce("blend", order.params.borrower);
  if (!minNonce.eq(order.params.nonce)) {
    throw new Error("cancelled");
  }

  let hasBalance = true;

  // Check: maker has enough balance
  const nftBalance = await commonHelpers.getNftBalance(
    order.params.lien?.collection,
    order.params.lien?.tokenId.toString(),
    Sdk.Blend.Addresses.Blend[config.chainId]
  );

  if (nftBalance.lt(1)) {
    hasBalance = false;
  }

  if (!hasBalance) {
    throw new Error("no-balance");
  }
};
