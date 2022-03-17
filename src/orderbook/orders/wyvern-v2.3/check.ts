import * as Sdk from "@reservoir0x/sdk";
import { BaseOrderInfo } from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { idb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import * as utils from "@/orderbook/orders/wyvern-v2.3/utils";

// TODO: Add support for on-chain check

export const offChainCheck = async (
  order: Sdk.WyvernV23.Order,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid.
    onChainSellApprovalRecheck?: boolean;
  }
) => {
  const info = order.getInfo();
  if (!info) {
    throw new Error("unknown-format");
  }

  const localTarget = await idb.oneOrNone(
    `
      SELECT "c"."kind" FROM "contracts" "c"
      WHERE "c"."address" = $/address/
    `,
    { address: toBuffer(info.contract) }
  );

  // Check: order has a valid target
  const contractKind = order.params.kind?.split("-")[0];
  if (!localTarget || localTarget.kind !== contractKind) {
    throw new Error("invalid-target");
  }

  if (order.params.side === Sdk.WyvernV23.Types.OrderSide.BUY) {
    // Check: maker has enough balance
    const balanceResult = await idb.oneOrNone(
      `
        SELECT "fb"."amount" FROM "ft_balances" "fb"
        WHERE "fb"."contract" = $/contract/
          AND "fb"."owner" = $/owner/
      `,
      {
        contract: toBuffer(order.params.paymentToken),
        owner: toBuffer(order.params.maker),
      }
    );
    if (!balanceResult || bn(balanceResult.amount).lt(order.params.basePrice)) {
      throw new Error("no-balance");
    }

    // Check: maker has set the proper approval
    // TODO: above check
  } else {
    // Check: maker has initialized a proxy
    const proxy = await utils.getUserProxy(order.params.maker);
    if (!proxy) {
      throw new Error("no-user-proxy");
    }

    // Check: maker has enough balance
    const balanceResult = await idb.oneOrNone(
      `
        SELECT "nb"."amount" FROM "nft_balances" "nb"
        WHERE "nb"."contract" = $/contract/
          AND "nb"."token_id" = $/tokenId/
          AND "nb"."owner" = $/owner/
      `,
      {
        contract: toBuffer(info.contract),
        tokenId: (info as BaseOrderInfo & { tokenId: string }).tokenId,
        owner: toBuffer(order.params.maker),
      }
    );
    if (!balanceResult || bn(balanceResult.amount).lt(1)) {
      throw new Error("no-balance");
    }

    // Check: maker has set the proper approval
    const approvalResult = await idb.oneOrNone(
      `
        SELECT "nae"."approved" FROM "nft_approval_events" "nae"
        WHERE "nae"."address" = $/address/
          AND "nae"."owner" = $/owner/
          AND "nae"."operator" = $/operator/
        ORDER BY "nae"."block" DESC
        LIMIT 1
      `,
      {
        address: toBuffer(info.contract),
        owner: toBuffer(order.params.maker),
        operator: toBuffer(proxy),
      }
    );
    if (!approvalResult || !approvalResult.approved) {
      if (options?.onChainSellApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract = order.params.kind?.includes("erc721")
          ? new Sdk.Common.Helpers.Erc721(baseProvider, info.contract)
          : new Sdk.Common.Helpers.Erc1155(baseProvider, info.contract);
        if (!(await contract.isApproved(order.params.maker, proxy))) {
          throw new Error("no-approval");
        }
      } else {
        throw new Error("no-approval");
      }
    }
  }
};
