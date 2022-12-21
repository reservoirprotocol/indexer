/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import crypto from "crypto";
import { redb, idb, pgp } from "@/common/db";
import { toBuffer, fromBuffer } from "@/common/utils";

export class ContractSets {
  public static getContractsSetId(contracts: string[]) {
    return crypto.createHash("sha256").update(_.sortBy(contracts).toString()).digest("hex");
  }

  public static async add(contracts: string[]) {
    // Sort the collections and create a unique hash
    const contractsHash = ContractSets.getContractsSetId(contracts);

    await idb.oneOrNone(
      `
      INSERT INTO contracts_sets (contracts_hash)
      VALUES ($/contractsHash/)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
      {
        contractsHash,
      }
    );

    const cs = new pgp.helpers.ColumnSet(["contracts_set_id", "contract"], {
      table: "contracts_sets_contracts",
    });

    const values = contracts.map((contract) => ({
      contracts_set_id: contractsHash,
      contract: toBuffer(contract),
    }));
    const query = pgp.helpers.insert(values, cs) + "ON CONFLICT DO NOTHING";

    await idb.none(query);

    return contractsHash;
  }

  public static async getContracts(contractsSetId: string): Promise<string[]> {
    const query = `
      SELECT contract
      FROM contracts_sets_contracts
      WHERE contracts_set_id = $/contractsSetId/
    `;

    const results = await redb.manyOrNone(query, { contractsSetId });
    return results.map((result) => fromBuffer(result.contract));
  }
}
