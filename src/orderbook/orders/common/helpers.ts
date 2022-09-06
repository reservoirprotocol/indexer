import { BigNumber } from "@ethersproject/bignumber";

import { redb } from "@/common/db";
import { toBuffer, bn } from "@/common/utils";
import { OrderKind } from "@/orderbook/orders";

export const getContractKind = async (
  contract: string
): Promise<"erc721" | "erc1155" | undefined> => {
  const contractResult = await redb.oneOrNone(
    `
      SELECT contracts.kind FROM contracts
      WHERE contracts.address = $/address/
    `,
    { address: toBuffer(contract) }
  );

  return contractResult?.kind;
};

export const getRoyalties = async (
  collection: string
): Promise<{ bps: number; recipient: string }[]> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        collections.royalties
      FROM collections
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );

  return collectionResult?.royalties || [];
};

export const getFtBalance = async (contract: string, owner: string): Promise<BigNumber> => {
  const balanceResult = await redb.oneOrNone(
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
  const balanceResult = await redb.oneOrNone(
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

export const getNftApproval = async (
  contract: string,
  owner: string,
  operator: string
): Promise<boolean> => {
  const approvalResult = await redb.oneOrNone(
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

export const getMinNonce = async (orderKind: OrderKind, maker: string): Promise<BigNumber> => {
  const bulkCancelResult: { nonce: string } | null = await redb.oneOrNone(
    `
      SELECT coalesce(
        (
          SELECT bulk_cancel_events.min_nonce FROM bulk_cancel_events
          WHERE bulk_cancel_events.order_kind = $/orderKind/
            AND bulk_cancel_events.maker = $/maker/
          ORDER BY bulk_cancel_events.min_nonce DESC
          LIMIT 1
        ),
        0
      ) AS nonce
    `,
    {
      orderKind,
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
  const nonceCancelResult = await redb.oneOrNone(
    `
      SELECT nonce FROM nonce_cancel_events
      WHERE order_kind = $/orderKind/
        AND maker = $/maker/
        AND nonce = $/nonce/
    `,
    {
      orderKind,
      maker: toBuffer(maker),
      nonce,
    }
  );

  return nonceCancelResult ? true : false;
};

export const isOrderCancelled = async (orderId: string): Promise<boolean> => {
  const cancelResult = await redb.oneOrNone(
    `
      SELECT order_id FROM cancel_events
      WHERE order_id = $/orderId/
    `,
    { orderId }
  );

  return cancelResult ? true : false;
};

export const getQuantityFilled = async (orderId: string): Promise<BigNumber> => {
  const fillResult = await redb.oneOrNone(
    `
      SELECT SUM(amount) AS quantity_filled FROM fill_events_2
      WHERE order_id = $/orderId/
    `,
    { orderId }
  );

  return bn(fillResult.quantity_filled || 0);
};
