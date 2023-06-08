import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";

// Must use `idb` and not `redb` since a lot of important processes
// depend on having information as up-to-date as possible
import { idb } from "@/common/db";
import { toBuffer, bn } from "@/common/utils";
import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";

export const getContractKind = async (
  contract: string
): Promise<"erc721" | "erc721-like" | "erc1155" | undefined> => {
  const contractResult = await idb.oneOrNone(
    `
      SELECT contracts.kind FROM contracts
      WHERE contracts.address = $/address/
    `,
    { address: toBuffer(contract) }
  );

  return contractResult?.kind;
};

export const getFtBalance = async (contract: string, owner: string): Promise<BigNumber> => {
  const balanceResult = await idb.oneOrNone(
    `
      SELECT ft_balances.amount FROM ft_balances
      WHERE ft_balances.contract = $/contract/
        AND ft_balances.owner = $/owner/
    `,
    {
      contract: toBuffer(contract),
      owner: toBuffer(owner),
    }
  );

  return bn(balanceResult ? balanceResult.amount : 0);
};

export const getNftBalance = async (
  contract: string,
  tokenId: string,
  owner: string
): Promise<BigNumber> => {
  const balanceResult = await idb.oneOrNone(
    `
      SELECT nft_balances.amount FROM nft_balances
      WHERE nft_balances.contract = $/contract/
        AND nft_balances.token_id = $/tokenId/
        AND nft_balances.owner = $/owner/
    `,
    {
      contract: toBuffer(contract),
      tokenId,
      owner: toBuffer(owner),
    }
  );

  return bn(balanceResult ? balanceResult.amount : 0);
};

export const getNfts = async (
  contract: string,
  owner: string
): Promise<{ tokenId: string; amount: string }[]> => {
  const nftsResult = await idb.manyOrNone(
    `
      SELECT
        nft_balances.token_id,
        nft_balances.amount
      FROM nft_balances
      WHERE nft_balances.contract = $/contract/
        AND nft_balances.owner = $/owner/
        AND nft_balances.amount > 0
    `,
    {
      contract: toBuffer(contract),
      owner: toBuffer(owner),
    }
  );

  return nftsResult.map(({ token_id, amount }: { token_id: string; amount: string }) => ({
    tokenId: token_id,
    amount,
  }));
};

export const getNftApproval = async (
  contract: string,
  owner: string,
  operator: string
): Promise<boolean> => {
  const approvalResult = await idb.oneOrNone(
    `
      SELECT nft_approval_events.approved FROM nft_approval_events
      WHERE nft_approval_events.address = $/address/
        AND nft_approval_events.owner = $/owner/
        AND nft_approval_events.operator = $/operator/
      ORDER BY nft_approval_events.block DESC
      LIMIT 1
    `,
    {
      address: toBuffer(contract),
      owner: toBuffer(owner),
      operator: toBuffer(operator),
    }
  );

  return approvalResult ? approvalResult.approved : false;
};

export const getMinNonce = async (
  orderKind: OrderKind,
  maker: string,
  side?: "sell" | "buy"
): Promise<BigNumber> => {
  const bulkCancelResult: { nonce: string } | null = await idb.oneOrNone(
    `
      SELECT coalesce(
        (
          SELECT bulk_cancel_events.min_nonce FROM bulk_cancel_events
          WHERE bulk_cancel_events.order_kind = $/orderKind/
            AND bulk_cancel_events.maker = $/maker/
            ${side ? " AND bulk_cancel_events.side = $/side/" : ""}
          ORDER BY bulk_cancel_events.min_nonce DESC
          LIMIT 1
        ),
        0
      ) AS nonce
    `,
    {
      orderKind,
      side,
      maker: toBuffer(maker),
    }
  );

  return bn(bulkCancelResult!.nonce);
};

export const isNonceCancelled = async (
  orderKind: OrderKind,
  maker: string,
  nonce: string
): Promise<boolean> => {
  const nonceCancelResult = await idb.oneOrNone(
    `
      SELECT nonce FROM nonce_cancel_events
      WHERE order_kind = $/orderKind/
        AND maker = $/maker/
        AND nonce = $/nonce/
      LIMIT 1
    `,
    {
      orderKind,
      maker: toBuffer(maker),
      nonce,
    }
  );

  return nonceCancelResult ? true : false;
};

export const isOrderCancelled = async (orderId: string, orderKind: OrderKind): Promise<boolean> => {
  const cancelResult = await idb.oneOrNone(
    `
      SELECT order_id FROM cancel_events
      WHERE order_id = $/orderId/
        AND order_kind = $/orderKind/
      LIMIT 1
    `,
    {
      orderId,
      orderKind,
    }
  );

  return cancelResult ? true : false;
};

export const isSubsetNonceCancelled = async (
  maker: string,
  subsetNonce: string
): Promise<boolean> => {
  const nonceCancelResult = await idb.oneOrNone(
    `
      SELECT
        1
      FROM looksrare_v2_subset_nonce_cancel_events
      WHERE maker = $/maker/
        AND nonce = $/nonce/
      LIMIT 1
    `,
    {
      maker: toBuffer(maker),
      nonce: subsetNonce,
    }
  );

  return nonceCancelResult ? true : false;
};

export const getQuantityFilled = async (orderId: string): Promise<BigNumber> => {
  const fillResult = await idb.oneOrNone(
    `
      SELECT SUM(amount) AS quantity_filled FROM fill_events_2
      WHERE order_id = $/orderId/
    `,
    { orderId }
  );

  return bn(fillResult.quantity_filled || 0);
};

export const isListingOffChainCancelled = async (
  orderKind: OrderKind,
  maker: string,
  contract: string,
  tokenId: string,
  originatedAt: string
) => {
  if (["blur", "x2y2"].includes(orderKind)) {
    // Blur and X2Y2 orders can get off-chain cancelled if the user
    // transferred to another wallet or revoked the approval
    let conduit: string;
    if (orderKind === "blur") {
      conduit = Sdk.Blur.Addresses.ExecutionDelegate[config.chainId];
    } else {
      conduit = Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId];
    }

    const result = await idb.oneOrNone(
      `
        SELECT
          1
        WHERE EXISTS(
            SELECT
            FROM nft_transfer_events
            WHERE nft_transfer_events.address = $/contract/
              AND nft_transfer_events.token_id = $/tokenId/
              AND nft_transfer_events.to != $/maker/
              AND nft_transfer_events.timestamp >= $/originatedAt/
          )
          OR EXISTS(
            SELECT
            FROM nft_approval_events
            WHERE nft_approval_events.address = $/contract/
              AND nft_approval_events.owner = $/maker/
              AND nft_approval_events.operator = $/conduit/
              AND NOT nft_approval_events.approved
              AND nft_approval_events.timestamp >= $/originatedAt/
          )
      `,
      {
        contract: toBuffer(contract),
        tokenId,
        maker: toBuffer(maker),
        conduit: toBuffer(conduit),
        originatedAt: Math.floor(new Date(originatedAt).getTime() / 1000),
      }
    );

    return Boolean(result);
  } else {
    return false;
  }
};
