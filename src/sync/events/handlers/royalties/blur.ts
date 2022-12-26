import { getEnhancedEventFromTransaction } from "../";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { bn } from "@/common/utils";
import * as utils from "@/events-sync/utils";
import { parseCallTrace } from "@georgeroman/evm-tx-simulator";
import { Royalty, getRoyalties } from "@/utils/royalties";
import { formatEther } from "@ethersproject/units";
import { parseEnhancedEventToOnChainData } from "./index"
import { concat } from "@/common/utils";
import * as es from "@/events-sync/storage";

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

  const events = await getEnhancedEventFromTransaction(txHash);
  const allOnChainData = await parseEnhancedEventToOnChainData(events);

  let fillEvents: es.fills.Event[] = [];

  for (let index = 0; index < allOnChainData.length; index++) {
    const data = allOnChainData[index];
    const allEvents = concat(data.fillEvents, data.fillEventsPartial, data.fillEventsOnChain);
    fillEvents = [...fillEvents, ...allEvents];
  }

  const collectionFills = fillEvents?.filter((_) => _.contract === contract) || [];
  const protocolFillEvents = fillEvents?.filter((_) => _.orderKind === "seaport") || [];

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

  const openSeaFeeRecipients = [
    "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
    "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
    "0x0000a26b00c1f0df003000390027140000faa719",
  ];

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

  for (const address in state) {
    const { tokenBalanceState } = state[address];

    const weth = Sdk.Common.Addresses.Weth[config.chainId];
    const native = Sdk.Common.Addresses.Eth[config.chainId];
    const isETH = currency === native;
    const balanceChange = isETH
      ? tokenBalanceState[`native:${native}`] || tokenBalanceState[`erc20:${weth}`]
      : tokenBalanceState[`erc20:${currency}`];

    // Receive ETH
    if (balanceChange && !balanceChange.startsWith("-")) {
      const bpsInPrice = bn(balanceChange).mul(10000).div(bn(price));
      const curRoyalties = {
        recipient: address,
        bps: bpsInPrice.toNumber(),
      };

      if (openSeaFeeRecipients.includes(address)) {
        // Need to know how many seaport sales in the same tx
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

  const paidFullRoyalty = royaltyFeeBreakdown.length === royaltyRecipients.length;

  const result = {
    txHash,
    sale: {
      tokenId,
      contract,
      currency,
      price: formatEther(price),
    },
    totalTransfers,
    royaltyFeeBps: getTotalRoyaltyBps(royaltyFeeBreakdown),
    marketplaceFeeBps: getTotalRoyaltyBps(marketplaceFeeBreakdown),
    royaltyFeeBreakdown,
    marketplaceFeeBreakdown,
    sameCollectionSales,
    paidFullRoyalty,
  };

  return result;
}
