import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { baseProvider } from "@/common/provider";
import { getEventsFromTx } from "../utils/test";
import * as seaport from "@/events-sync/handlers/seaport";

import { bn } from "@/common/utils";
import * as utils from "@/events-sync/utils";
import { parseCallTrace } from "@georgeroman/evm-tx-simulator";
import { Royalty, getDefaultRoyalties } from "@/utils/royalties";
import { formatEther } from "@ethersproject/units";

import { parseEnhancedEventsToEventsInfo } from "@/events-sync/index";
import { parseEventsInfo } from "@/events-sync/handlers";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { concat } from "@/common/utils";
import * as es from "@/events-sync/storage";

async function parseEnhancedEventToOnChainData(enhancedEvents: EnhancedEvent[]) {
  const eventsInfos = await parseEnhancedEventsToEventsInfo(enhancedEvents, false);
  const allOnChainData: OnChainData[] = [];
  for (let index = 0; index < eventsInfos.length; index++) {
    const eventsInfo = eventsInfos[index];
    const onchainData = await parseEventsInfo(eventsInfo);
    allOnChainData.push(onchainData);
  }
  return allOnChainData;
}

async function extractRoyaltiesForSeaport(fillEvent: es.fills.Event) {
  const royalty_fee_breakdown: Royalty[] = [];
  const marketplace_fee_breakdown: Royalty[] = [];
  const possible_missing_royalties: Royalty[] = [];

  const { txHash } = fillEvent.baseEventParams;

  const { tokenId, contract, price } = fillEvent;
  const txTrace = await utils.fetchTransactionTrace(txHash);
  if (!txTrace) {
    return;
  }

  // need cache in database ?
  const transaction = await baseProvider.getTransactionReceipt(txHash);

  // inside `getEventsFromTx` has one getBlock call
  const events = await getEventsFromTx(transaction);

  // const txEvents = await seaport.handleEvents(events);
  // const fillEvents = txEvents.fillEventsPartial;
  const allOnChainData = await parseEnhancedEventToOnChainData(events);

  let fillEvents: es.fills.Event[] = [];

  for (let index = 0; index < allOnChainData.length; index++) {
    const data = allOnChainData[index];
    const allEvents = concat(data.fillEvents, data.fillEventsPartial, data.fillEventsOnChain);
    fillEvents = [...fillEvents, ...allEvents];
  }

  // console.log("fillEvents", fillEvents)
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
  let royalties = await getDefaultRoyalties(contract, tokenId);

  // mock for testing
  if (!royalties.length && contract === "0x33c6eec1723b12c46732f7ab41398de45641fa42") {
    royalties = [
      {
        bps: 750,
        recipient: "0x459fe44490075a2ec231794f9548238e99bf25c0",
      },
    ];
  }

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
    const weth = "erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    const native = "native:0x0000000000000000000000000000000000000000";
    const balanceChange = tokenBalanceState[native] || tokenBalanceState[weth];

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
        marketplace_fee_breakdown.push(curRoyalties);
      } else if (royaltyRecipients.includes(address)) {
        // For multiple same collection sales in one tx
        curRoyalties.bps = bn(balanceChange).mul(10000).div(collectionRelatedAmount).toNumber();
        royalty_fee_breakdown.push(curRoyalties);
      } else if (bpsInPrice.lt(threshold)) {
        possible_missing_royalties.push(curRoyalties);
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

  const paid_full_royalty = royalty_fee_breakdown.length === royaltyRecipients.length;

  // console.log("balanceChangeWithBps", balanceChangeWithBps, tokenId, contract, possible_missing_royalties);

  const result = {
    txHash,
    sale: {
      tokenId,
      contract,
      price: formatEther(price),
    },
    totalTransfers,
    royalty_fee_bps: getTotalRoyaltyBps(royalty_fee_breakdown),
    marketplace_fee_bps: getTotalRoyaltyBps(marketplace_fee_breakdown),
    royalty_fee_breakdown,
    marketplace_fee_breakdown,
    sameCollectionSales,
    paid_full_royalty,
  };

  // console.log("balanceChangeWithBps", balanceChangeWithBps)
  // console.log("result", result);
  // console.log("tokenId", tokenId)
  // console.log("state", state)
  // console.log("royalties", royalties)
  // console.log("possible_missing_royalties", possible_missing_royalties)
  return result;
}

jest.setTimeout(1000 * 1000);

describe("Royalties - Seaport", () => {
  const TEST_COLLECTION = "0x33c6eec1723b12c46732f7ab41398de45641fa42";

  const testFeeExtract = async (txHash: string) => {
    const tx = await baseProvider.getTransactionReceipt(txHash);
    const events = await getEventsFromTx(tx);
    const result = await seaport.handleEvents(events);
    const fillEvents = result.fillEventsPartial ?? [];
    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const fees = await extractRoyaltiesForSeaport(fillEvent);
      if (fees?.sale.contract === TEST_COLLECTION) {
        expect(fees?.royalty_fee_bps).toEqual(750);
      }
      expect(fees?.marketplace_fee_bps).toEqual(250);
    }
  };

  const txIds = [
    ["single sale", "0x93de26bea65832e10c253f6cd0bf963619d7aef63695b485d9df118dd6bd4ae4"],
    [
      "multiple sales with different protocols(x2y2+seaport)",
      "0xa451be1bd9edef5cab318e3cb0fbff6a6f9955dfd49e484caa37dbaa6982a1ed",
    ],
    [
      "multiple sales with different collections",
      "0xfef549999f91e499dc22ad3d635fd05949d1a7fda1f7c5827986f23fc341f828",
    ],
    [
      "multiple sales with same collection",
      "0x28cb9371d6d986a00e19797270c542ad6901abec7b67bbef7b2ae947b3c37c0b",
    ],
  ];

  for (const [name, txHash] of txIds) {
    // if (txHash === "0xa451be1bd9edef5cab318e3cb0fbff6a6f9955dfd49e484caa37dbaa6982a1ed")
    it(`${name}`, async () => testFeeExtract(txHash));
  }
});
