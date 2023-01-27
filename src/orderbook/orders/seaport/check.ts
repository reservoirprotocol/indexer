import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as onChainData from "@/utils/on-chain-data";
import { PartialOrderComponents } from "@/orderbook/orders/seaport/index";

export const offChainCheck = async (
  order: Sdk.Seaport.Order,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid. We use the this option to validate approval
    // of buy orders as well.
    onChainApprovalRecheck?: boolean;
    checkFilledOrCancelled?: boolean;
    debugLogs?: string[];
  }
) => {
  const id = order.hash();

  // Check: order has a known format
  const info = order.getInfo();
  if (!info) {
    throw new Error("unknown-format");
  }

  let timeStartInterval = performance.now();

  // Check: order is on a known and valid contract
  const kind = await commonHelpers.getContractKind(info.contract);

  options?.debugLogs?.push(
    `getContractKind=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
  );

  timeStartInterval = performance.now();

  if (!kind || kind !== info.tokenKind) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id);

    options?.debugLogs?.push(
      `isOrderCancelledTimeElapsed=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
    );

    timeStartInterval = performance.now();

    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);

    options?.debugLogs?.push(
      `getQuantityFilledTimeElapsed=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
    );

    timeStartInterval = performance.now();

    if (quantityFilled.gte(info.amount)) {
      throw new Error("filled");
    }
  }

  // Check: order has a valid nonce
  const minNonce = await commonHelpers.getMinNonce("seaport", order.params.offerer);

  options?.debugLogs?.push(
    `getMinNonce=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
  );

  timeStartInterval = performance.now();

  if (!minNonce.eq(order.params.counter)) {
    throw new Error("cancelled");
  }

  const conduit = new Sdk.Seaport.Exchange(config.chainId).deriveConduit(order.params.conduitKey);

  options?.debugLogs?.push(
    `deriveConduit=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
  );

  timeStartInterval = performance.now();

  let hasBalance = true;
  let hasApproval = true;
  if (info.side === "buy") {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(info.paymentToken, order.params.offerer);

    options?.debugLogs?.push(
      `getFtBalance=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
    );

    timeStartInterval = performance.now();

    if (ftBalance.lt(info.price)) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(
              info.paymentToken,
              order.params.offerer,
              conduit,
              true,
              options?.debugLogs
            )
            .then((a) => a.value)
        ).lt(info.price)
      ) {
        hasApproval = false;
      }

      options?.debugLogs?.push(
        `fetchAndUpdateFtApproval=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
      );
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      info.contract,
      info.tokenId!,
      order.params.offerer
    );

    options?.debugLogs?.push(
      `getNftBalance=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
    );

    timeStartInterval = performance.now();

    if (nftBalance.lt(info.amount)) {
      hasBalance = false;
    }

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      info.contract,
      order.params.offerer,
      conduit
    );

    options?.debugLogs?.push(
      `getNftApproval=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
    );

    timeStartInterval = performance.now();

    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          info.tokenKind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, info.contract)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, info.contract);
        if (!(await contract.isApproved(order.params.offerer, conduit))) {
          hasApproval = false;
        }

        options?.debugLogs?.push(
          `isApproved=${Math.floor((performance.now() - timeStartInterval) / 1000)}`
        );
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

export const offChainCheckPartial = async (
  orderParams: PartialOrderComponents,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid. We use the this option to validate approval
    // of buy orders as well.
    onChainApprovalRecheck?: boolean;
    checkFilledOrCancelled?: boolean;
  }
) => {
  const id = orderParams.hash;
  const conduitKey = "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000";

  // Check: order is on a known and valid contract
  const kind = await commonHelpers.getContractKind(orderParams.contract);

  if (!kind) {
    throw new Error("invalid-target");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id);
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(orderParams.amount)) {
      throw new Error("filled");
    }
  }

  const conduit = new Sdk.Seaport.Exchange(config.chainId).deriveConduit(conduitKey);

  let hasBalance = true;
  let hasApproval = true;

  if (orderParams.side === "buy") {
    // Check: maker has enough balance
    const ftBalance = await commonHelpers.getFtBalance(
      orderParams.paymentToken,
      orderParams.offerer
    );
    if (ftBalance.lt(orderParams.price)) {
      hasBalance = false;
    }

    if (options?.onChainApprovalRecheck) {
      if (
        bn(
          await onChainData
            .fetchAndUpdateFtApproval(orderParams.paymentToken, orderParams.offerer, conduit, true)
            .then((a) => a.value)
        ).lt(orderParams.price)
      ) {
        hasApproval = false;
      }
    }
  } else {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      orderParams.contract,
      orderParams.tokenId!,
      orderParams.offerer
    );
    if (nftBalance.lt(orderParams.amount)) {
      hasBalance = false;
    }

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      orderParams.contract,
      orderParams.offerer,
      conduit
    );

    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          kind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, orderParams.contract)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, orderParams.contract);
        if (!(await contract.isApproved(orderParams.offerer, conduit))) {
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

export const offChainCheckBundle = async (
  order: Sdk.Seaport.BundleOrder,
  options?: {
    // Some NFTs pre-approve common exchanges so that users don't
    // spend gas approving them. In such cases we will be missing
    // these pre-approvals from the local database and validation
    // purely from off-chain state can be inaccurate. In order to
    // handle this, we allow the option to double validate orders
    // on-chain in case off-chain validation returns the order as
    // being invalid. We use the this option to validate approval
    // of buy orders as well.
    onChainApprovalRecheck?: boolean;
    checkFilledOrCancelled?: boolean;
  }
) => {
  const id = order.hash();

  // Check: order has a known format
  const info = order.getInfo();
  if (!info) {
    throw new Error("unknown-format");
  }

  if (options?.checkFilledOrCancelled) {
    // Check: order is not cancelled
    const cancelled = await commonHelpers.isOrderCancelled(id);
    if (cancelled) {
      throw new Error("cancelled");
    }

    // Check: order is not filled
    const quantityFilled = await commonHelpers.getQuantityFilled(id);
    if (quantityFilled.gte(1)) {
      throw new Error("filled");
    }
  }

  // Check: order has a valid nonce
  const minNonce = await commonHelpers.getMinNonce("seaport", order.params.offerer);
  if (!minNonce.eq(order.params.counter)) {
    throw new Error("cancelled");
  }

  const conduit = new Sdk.Seaport.Exchange(config.chainId).deriveConduit(order.params.conduitKey);

  let hasBalance = true;
  let hasApproval = true;
  for (const item of order.getInfo()!.offerItems) {
    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      item.contract,
      item.tokenId!,
      order.params.offerer
    );
    if (nftBalance.lt(item.amount || 1)) {
      hasBalance = false;
    }

    // Check: maker has set the proper approval
    const nftApproval = await commonHelpers.getNftApproval(
      item.contract,
      order.params.offerer,
      conduit
    );
    if (!nftApproval) {
      if (options?.onChainApprovalRecheck) {
        // Re-validate the approval on-chain to handle some edge-cases
        const contract =
          item.tokenKind === "erc721"
            ? new Sdk.Common.Helpers.Erc721(baseProvider, item.contract)
            : new Sdk.Common.Helpers.Erc1155(baseProvider, item.contract);
        if (!(await contract.isApproved(order.params.offerer, conduit))) {
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
