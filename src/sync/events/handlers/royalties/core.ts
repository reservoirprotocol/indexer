import { formatEther } from "@ethersproject/units";
import { parseCallTrace } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { bn } from "@/common/utils";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { Royalty, getRoyalties } from "@/utils/royalties";
import { platformFeeRecipientsRegistry } from "./config";

export async function extractRoyalties(fillEvent: es.fills.Event) {
  const royaltyFeeBreakdown: Royalty[] = [];
  const marketplaceFeeBreakdown: Royalty[] = [];
  const possibleMissingRoyalties: Royalty[] = [];

  const { txHash } = fillEvent.baseEventParams;

  const { tokenId, contract, price, currency } = fillEvent;
  const txTrace = await utils.fetchTransactionTrace(txHash);
  if (!txTrace) {
    return null;
  }

  const fillEvents: es.fills.Event[] = await getFillEventsFromTx(txHash);

  const collectionFills = fillEvents?.filter((_) => _.contract === contract) || [];
  const protocolFillEvents = fillEvents?.filter((_) => _.orderKind === fillEvent.orderKind) || [];

  const protocolRelatedAmount = protocolFillEvents
    ? protocolFillEvents.reduce((total, item) => {
        return total.add(bn(item.price));
      }, bn(0))
    : bn(0);

  const collectionRelatedAmount = collectionFills.reduce((total, item) => {
    return total.add(bn(item.price));
  }, bn(0));

  const state = parseCallTrace(txTrace.calls);
  const royalties = await getRoyalties(contract, tokenId);

  const balanceChangeWithBps = [];
  const royaltyRecipients: string[] = royalties.map((_) => _.recipient);
  const threshold = 1000;
  let sameCollectionSales = 0;
  let totalTransfers = 0;

  // Tracking same collection sales
  for (const address in state) {
    const { tokenBalanceState } = state[address];
    for (const stateId in tokenBalanceState) {
      const changeValue = tokenBalanceState[stateId];
      const nftTransfer = stateId.startsWith(`erc721:`) || stateId.startsWith(`erc1155:`);
      const isNFTState =
        stateId.startsWith(`erc721:${contract}`) || stateId.startsWith(`erc1155:${contract}`);
      const notIncrease = changeValue.startsWith("-");
      if (isNFTState && !notIncrease) {
        sameCollectionSales++;
      }
      if (nftTransfer && !notIncrease) {
        totalTransfers++;
      }
    }
  }

  const platformFeeRecipients: string[] =
    platformFeeRecipientsRegistry.get(fillEvent.orderKind) ?? [];

  for (const address in state) {
    const { tokenBalanceState } = state[address];

    // TODO Move to the SDK
    const BETH = "0x0000000000a39bb272e79075ade125fd351887ac";
    const Weth = Sdk.Common.Addresses.Weth[config.chainId];
    const native = Sdk.Common.Addresses.Eth[config.chainId];
    const isETH = currency === native;

    const balanceChange = isETH
      ? tokenBalanceState[`native:${native}`] ||
        tokenBalanceState[`erc20:${BETH}`] ||
        tokenBalanceState[`erc20:${Weth}`]
      : tokenBalanceState[`erc20:${currency}`];

    // Receive ETH
    if (balanceChange && !balanceChange.startsWith("-")) {
      const bpsInPrice = bn(balanceChange).mul(10000).div(bn(price));
      const curRoyalties = {
        recipient: address,
        bps: bpsInPrice.toNumber(),
      };

      if (platformFeeRecipients.includes(address)) {
        curRoyalties.bps = bn(balanceChange).mul(10000).div(protocolRelatedAmount).toNumber();
        marketplaceFeeBreakdown.push(curRoyalties);
      } else if (royaltyRecipients.includes(address)) {
        // For multiple same collection sales in one tx
        curRoyalties.bps = bn(balanceChange).mul(10000).div(collectionRelatedAmount).toNumber();
        royaltyFeeBreakdown.push(curRoyalties);
      } else if (bpsInPrice.lt(threshold)) {
        possibleMissingRoyalties.push(curRoyalties);
      }

      balanceChangeWithBps.push({
        recipient: address,
        balanceChange,
        bps: bpsInPrice.toString(),
      });
    }
  }

  const getTotalRoyaltyBps = (royalties?: Royalty[]) =>
    (royalties || []).map(({ bps }) => bps).reduce((a, b) => a + b, 0);

  const royaltyFeeBps = getTotalRoyaltyBps(royaltyFeeBreakdown);
  const creatorBps = getTotalRoyaltyBps(royalties);

  const paidFullRoyalty = royaltyFeeBps >= creatorBps;

  const result = {
    txHash,
    sale: {
      tokenId,
      contract,
      currency,
      price: formatEther(price),
    },
    totalTransfers,
    royaltyFeeBps,
    marketplaceFeeBps: getTotalRoyaltyBps(marketplaceFeeBreakdown),
    royaltyFeeBreakdown,
    marketplaceFeeBreakdown,
    sameCollectionSales,
    paidFullRoyalty,
  };

  return result;
}
