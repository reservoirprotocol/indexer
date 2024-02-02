import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

export const offChainCheck = async (id: string) => {
  const result = await idb.oneOrNone(
    `
      SELECT
        orders.side,
        orders.maker,
        orders.token_set_id
      FROM orders
      WHERE orders.id = $/id/
        AND orders.kind = 'nftx-v3'
    `,
    { id }
  );

  if (result.side === "sell") {
    const [contract, tokenId] = result.token_set_id.split(":").slice(1);

    // Check: maker has enough balance
    const nftBalance = await commonHelpers.getNftBalance(
      contract,
      tokenId,
      fromBuffer(result.maker)
    );
    if (nftBalance.lt(1)) {
      throw new Error("no-balance");
    }
  } else {
    // TODO: Add buy side balance checks
  }
};
