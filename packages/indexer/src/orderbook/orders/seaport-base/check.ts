import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";
import { getPersistentPermit } from "@/utils/permits";

export type SeaportOrderKind = "alienswap" | "seaport" | "seaport-v1.4" | "seaport-v1.5";

export const offChainCheck = async (
  order: Sdk.SeaportBase.IOrder,
  orderKind: SeaportOrderKind,
  exchange: Sdk.SeaportBase.SeaportBaseExchange,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid. We use this option to validate approval
    // of buy orders as well.
    onChainApprovalRecheck?: boolean;
    checkFilledOrCancelled?: boolean;
    singleTokenERC721ApprovalCheck?: boolean;
    // Will do the balance/approval checks against this quantity
    quantityRemaining?: number;
    // Permits to use
    permitId?: string;
    permitIndex?: number;
  }
) => {
  const id = order.hash();

  // Check: order has a known format
  const info = order.getInfo();
  if (!info) {
    throw new Error("unknown-format");
  }

  // Check: order is on a known and valid contract
  const kind = await commonHelpers.getContractKind(info.contract);
  if (!kind) {
    throw new Error("invalid-target");
  }
  if (["erc1155"].includes(kind) && info.tokenKind !== "erc1155") {
    throw new Error("invalid-target");
  }
  if (["erc721", "erc721-like"].includes(kind) && info.tokenKind !== "erc721") {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, orderKind);
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(info.amount)) {
      throw new Error("filled");
    }
  }

  // Check: order has a valid nonce
  const minNonce = await commonHelpers.getMinNonce(orderKind, order.params.offerer);
  if (!minNonce.eq(order.params.counter)) {
    throw new Error("cancelled");
  }

  const conduit = exchange.deriveConduit(order.params.conduitKey);

  const checkQuantity = options?.quantityRemaining ?? info.amount;

  // Fix for the weird race condition of orders being fillable but having a quantity remaining of 0
  if (String(checkQuantity) === "0") {
    throw new Error("filled");
  }

  let hasBalance = true;
  let hasApproval = true;
  if (info.side === "buy") {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(info.paymentToken, order.params.offerer);

    const neededBalance = bn(info.price).div(info.amount).mul(checkQuantity);
    if (ftBalance.lt(neededBalance)) {
      hasBalance = false;
    }

    if (options?.permitId) {
      const permit = await getPersistentPermit(options.permitId, options.permitIndex ?? 0);
      if (!permit) {
        hasApproval = false;
      }
    } else if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(info.paymentToken, order.params.offerer, conduit, true)
            .then((a) => a.value)
        ).lt(neededBalance)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      info.contract,
      info.tokenId!,
      order.params.offerer
    );

    if (nftBalance.lt(checkQuantity)) {
      hasBalance = false;
    }

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      info.contract,
      order.params.offerer,
      conduit
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          info.tokenKind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, info.contract)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, info.contract);

        const isApprovedForAll = await contract.isApproved(order.params.offerer, conduit);
        if (!isApprovedForAll) {
          // In some edge-cases we might want to check single-token approvals as well
          if (options.singleTokenERC721ApprovalCheck && info.tokenKind === "erc721") {
            const isApprovedSingleToken = await (
              contract as Sdk.Common.Helpers.Erc721
            ).isApprovedSingleToken(info.tokenId!, conduit);
            if (!isApprovedSingleToken) {
              hasApproval = false;
            }
          } else {
            hasApproval = false;
          }
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
