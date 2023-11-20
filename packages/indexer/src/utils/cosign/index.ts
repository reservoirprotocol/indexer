import { Wallet } from "@ethersproject/wallet";
import { verifyTypedData } from "@ethersproject/wallet";

import { idb, pgp } from "@/common/db";
import { config } from "@/config/index";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

export const cosigner = () => new Wallet(config.cosignerPrivateKey);

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

export const saveOffChainCancellations = async (orderIds: string[]) => {
  const columns = new pgp.helpers.ColumnSet(
    ["order_id", { name: "timestamp", mod: ":raw", init: () => "now()" }],
    {
      table: "off_chain_cancellations",
    }
  );
  await idb.none(
    pgp.helpers.insert(
      orderIds.map((orderId) => ({ orderId })),
      columns
    ) + " ON CONFLICT DO NOTHING"
  );

  await orderUpdatesByIdJob.addToQueue(
    orderIds.map((orderId: string) => ({
      context: `cancel-${orderId}`,
      id: orderId,
      trigger: {
        kind: "cancel",
      },
    }))
  );
};
