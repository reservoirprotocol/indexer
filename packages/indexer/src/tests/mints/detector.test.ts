import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import { config } from "@/config/index";
import * as detector from "@/orderbook/mints/calldata/detector";
import { upsertCollectionMint } from "@/orderbook/mints";
import { extractByTx } from "../../orderbook/mints/calldata/detector/generic";
import * as utils from "@/events-sync/utils";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";

import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

jest.setTimeout(1000 * 1000);

export async function saveContract(address: string, kind: string) {
  const columns = new pgp.helpers.ColumnSet(["address", "kind"], {
    table: "contracts",
  });

  const queries = [
    `INSERT INTO "contracts" (
        "address",
        "kind"
      ) VALUES ${pgp.helpers.values(
        {
          address: toBuffer(address),
          kind,
        },
        columns
      )}
      ON CONFLICT DO NOTHING
    `,
    `
    INSERT INTO "collections" (
      "id",
      "token_count",
      "slug",
      "name",
      "contract"
    ) VALUES ${pgp.helpers.values(
      {
        id: address,
        token_count: 10000,
        slug: address,
        name: "Mock Name",
        contract: toBuffer(address),
      },
      new pgp.helpers.ColumnSet(["id", "token_count", "slug", "name", "contract"], {
        table: "collections",
      })
    )}
    ON CONFLICT DO NOTHING
    `,
  ];

  await idb.none(pgp.helpers.concat(queries));
}

describe("Mints - Detector", () => {
  it("base-normal-case1", async () => {
    if (config.chainId != 8453) {
      return;
    }
    const txIds = [
      "0xa1e59fc5cbb627d981b356a017cdb53cfc40549ef68b562068fe792fd0d89c37",
      "0x13dcd467192096bbd652d934dd0d7a40581bc6d39d38d9e8a874e7a77151d732",
    ];
    for (const txId of txIds) {
      const mints = await detector.extractByTx(txId, true);
      expect(mints.length).not.toBe(0);
    }
  });

  it("test-minting", async () => {
    const collection = "0x932261f9fc8da46c4a22e31b45c4de60623848bf";
    await saveContract(collection, "erc721");
    const tx = "0xf75007f6edef7857808ac38122e10f7144477d04d698f08a2c0899bb530c12fc";
    const transcation = await utils.fetchTransaction(tx);
    const mints = await extractByTx(collection, transcation, parseEther("0"), BigNumber.from("1"));
    // console.log('mints', mints)
    for (const mint of mints) {
      await upsertCollectionMint(mint);
    }
    const result = await idb.oneOrNone(
      `
      SELECT collections.is_minting 
        FROM collections 
      WHERE collections.id = $/collection/
   `,
      {
        collection,
      }
    );
    expect(result.is_minting).toBe(1);
  });
});
