import { verifyTypedData } from "@ethersproject/wallet";
import * as Sdk from "@reservoir0x/sdk";

import { idb } from "@/common/db";
import { config } from "@/config/index";
import { cosigner, saveOffChainCancellations } from "@/utils/offchain-cancel";
import {
  ExternalTypedDataSigner,
  getExternalCosigner,
} from "@/utils/offchain-cancel/external-cosign";
import * as paymentProcessorV2 from "@/utils/payment-processor-v2";

// Reuse the cancellation format of `seaport` orders
export const generateOffChainCancellationSignatureData = (orderIds: string[]) => {
  return {
    signatureKind: "eip712",
    domain: {
      name: "Off-Chain Cancellation",
      version: "1.0.0",
      chainId: config.chainId,
    },
    types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
    value: {
      orderHashes: orderIds,
    },
    primaryType: "OrderHashes",
  };
};

export const verifyOffChainCancellationSignature = (
  orderIds: string[],
  signature: string,
  signer: string
) => {
  const message = generateOffChainCancellationSignatureData(orderIds);
  const recoveredSigner = verifyTypedData(message.domain, message.types, message.value, signature);
  return recoveredSigner.toLowerCase() === signer.toLowerCase();
};

export const doCancel = async ({
  orderIds,
  signature,
  maker,
}: {
  orderIds: string[];
  signature: string;
  maker: string;
}) => {
  const success = verifyOffChainCancellationSignature(orderIds, signature, maker);
  if (!success) {
    throw new Error("Cancellation failed");
  }

  // Save cancellations
  await saveOffChainCancellations(orderIds);
};

export const doSignOrder = async (order: Sdk.PaymentProcessorV2.Order, taker: string) => {
  if (order.isCosignedOrder()) {
    const isOffChainCancelled = await idb.oneOrNone(
      `SELECT 1 FROM off_chain_cancellations WHERE order_id = $/orderId/`,
      { orderId: order.hash() }
    );
    if (isOffChainCancelled) {
      throw new Error("Order is off-chain cancelled");
    }

    const consiger = order.params.cosigner!;
    const externalCosigner = await getExternalCosigner(consiger);
    if (externalCosigner) {
      await order.cosign(new ExternalTypedDataSigner(externalCosigner), taker);
    } else {
      await order.cosign(cosigner(), taker);
    }
  }

  const isBanned = await paymentProcessorV2.checkAccountIsBanned(order.params.tokenAddress, taker);
  if (isBanned) {
    throw new Error("Taker is banned");
  }
};
