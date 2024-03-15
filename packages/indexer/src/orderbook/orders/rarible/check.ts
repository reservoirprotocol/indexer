import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";
import { AssetClass } from "@reservoir0x/sdk/dist/rarible/types";

export const offChainCheck = async (
  order: Sdk.Rarible.Order,
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
  const id = order.hashOrderKey();
  const { side } = order.getInfo()!;
  // Check: order has a valid target
  let kind: string | undefined = "";
  switch (side) {
    case "buy":
      kind = await commonHelpers.getContractKind(order.params.take.assetType.contract!);
      break;
    case "sell":
      kind = await commonHelpers.getContractKind(order.params.make.assetType.contract!);
      break;
    default:
      break;
  }
  if (!kind) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id, "rarible");
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    const orderAmount = side === "buy" ? order.params.take.value : order.params.make.value;
    if (quantityFilled.gte(orderAmount)) {
      throw new Error("filled");
    }
  }

  let hasBalance = true;
  let hasApproval = true;
  if (side === "buy") {
    // Handle rebasing tokens (where applicable)
    await onChainData.updateFtBalance(order.params.make.assetType.contract!, order.params.maker);

    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(
      order.params.make.assetType.contract!,
      order.params.maker
    );
    if (ftBalance.lt(order.params.make.value)) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              order.params.make.assetType.contract!,
              order.params.maker,
              Sdk.Rarible.Addresses.ERC20TransferProxy[config.chainId],
              true
            )
            .then((a) => a.value)
        ).lt(order.params.make.value)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      order.params.make.assetType.contract!,
      order.params.make.assetType.tokenId!,
      order.params.maker
    );
    if (nftBalance.lt(order.params.make.value)) {
      hasBalance = false;
    }

    // TODO: Verify ERC721_LAZY and ERC1155_LAZY orders don't need collection approval
    if (
      order.params.make.assetType.assetClass === AssetClass.ERC721 ||
      order.params.make.assetType.assetClass === AssetClass.ERC1155
    ) {
      const operator = Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId];
      // Check: maker has set the proper approval
      const nftApproval = await commonHelpers.getNftApproval(
        order.params.make.assetType.contract!,
        order.params.maker,
        operator
      );

      if (!nftApproval) {
        if (options?.onChainApprovalRecheck) {
          // Re-validate the approval on-chain to handle some edge-cases
          const contract =
            kind === "erc721"
              ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.make.assetType.contract!)
              : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.make.assetType.contract!);
          if (!(await contract.isApproved(order.params.maker, operator))) {
            hasApproval = false;
          }
        } else {
          hasApproval = false;
        }
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
