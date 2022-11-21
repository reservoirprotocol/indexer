import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { baseProvider } from "@/common/provider";
import { getEventsFromTx } from "../utils/test";
import * as seaport from "@/events-sync/handlers/seaport";
import * as es from "@/events-sync/storage";

import { bn } from "@/common/utils";
import * as utils from "@/events-sync/utils";
import { parseCallTrace } from "@georgeroman/evm-tx-simulator";
import { Royalty, getDefaultRoyalties } from "@/utils/royalties";

import { refreshAllRoyaltySpecs } from "@/utils/royalties";
import * as fetchCollectionMetadata from "@/jobs/token-updates/fetch-collection-metadata";

// const testFees = {
//   // Ledger
//   "0x33c6eec1723b12c46732f7ab41398de45641fa42": [
//     {
//       bps: 750,
//       recipient: "0x459fe44490075a2ec231794f9548238e99bf25c0",
//     },
//   ],
//   // ChillTuna
//   "0x0735a2961eb2b18b28daa72b593dfbaa7f9d1929": [
//     {
//       bps: 750,
//       recipient: "0xec934b9dcc00df6b5355dfd8b638db9a69e43ff8",
//     },
//   ],
// };

async function extractRoyalties(fillEvent: es.fills.Event) {
  const royalty_fee_breakdown: Royalty[] = [];
  const marketplace_fee_breakdown: Royalty[] = [];

  const possible_missing_royalties: Royalty[] = [];

  const { tokenId, contract, price } = fillEvent;
  const txTrace = await utils.fetchTransactionTrace(fillEvent.baseEventParams.txHash);
  if (!txTrace) {
    return;
  }

  const state = parseCallTrace(txTrace.calls);
  const royalties = await getDefaultRoyalties(contract, tokenId);

  const openSeaFeeRecipients = [
    "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073",
    "0x8de9c5a032463c561423387a9648c5c7bcc5bc90",
    "0x0000a26b00c1f0df003000390027140000faa719",
  ];

  const balanceChangeWithBps = [];
  const royaltyRecipients: string[] = royalties.map((_) => _.recipient);
  const threshold = 1000;

  for (const address in state) {
    const { tokenBalanceState } = state[address];

    const weth = "erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    const native = "native:0x0000000000000000000000000000000000000000";
    const balanceChange = tokenBalanceState[native] || tokenBalanceState[weth];

    if (balanceChange && !balanceChange.startsWith("-")) {
      const bpsInPrice = bn(balanceChange).mul(10000).div(bn(price));

      const royalties = {
        recipient: address,
        bps: bpsInPrice.toNumber(),
      };

      if (openSeaFeeRecipients.includes(address)) {
        marketplace_fee_breakdown.push(royalties);
      } else if (royaltyRecipients.includes(address)) {
        royalty_fee_breakdown.push(royalties);
      } else if (bpsInPrice.lt(threshold)) {
        possible_missing_royalties.push(royalties);
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

  return {
    royalty_fee_bps: getTotalRoyaltyBps(royalty_fee_breakdown),
    marketplace_fee_bps: getTotalRoyaltyBps(marketplace_fee_breakdown),
    royalty_fee_breakdown,
    marketplace_fee_breakdown,
    paid_full_royalty,
  };
}

jest.setTimeout(1000 * 1000);

describe("Royalties", () => {
  test("Opensea", async () => {
    const txIds = [
      // single
      // "0x93de26bea65832e10c253f6cd0bf963619d7aef63695b485d9df118dd6bd4ae4",
      // multiple
      "0xa451be1bd9edef5cab318e3cb0fbff6a6f9955dfd49e484caa37dbaa6982a1ed",
    ];

    await fetchCollectionMetadata.addToQueue([
      {
        contract: "0x33c6eec1723b12c46732f7ab41398de45641fa42",
        tokenId: "2017",
        mintedTimestamp: Math.floor(Date.now() / 1000),
      },
    ]);

    await refreshAllRoyaltySpecs(
      "0x33c6eec1723b12c46732f7ab41398de45641fa42",
      [
        {
          bps: 750,
          recipient: "0x459fe44490075a2ec231794f9548238e99bf25c0",
        },
      ],
      [
        {
          bps: 750,
          recipient: "0x459fe44490075a2ec231794f9548238e99bf25c0",
        },
      ]
    );

    for (let index = 0; index < txIds.length; index++) {
      const txHash = txIds[index];
      const tx = await baseProvider.getTransactionReceipt(txHash);
      const events = await getEventsFromTx(tx);
      const result = await seaport.handleEvents(events);

      const fillEvents = result.fillEventsPartial ?? [];
      for (let index = 0; index < fillEvents.length; index++) {
        const fillEvent = fillEvents[index];
        await extractRoyalties(fillEvent)
        // console.log("result", await extractRoyalties(fillEvent))
        // const fees = await extractRoyalties(fillEvent);
      }
      // console.log("result", result)
    }
  });
});
