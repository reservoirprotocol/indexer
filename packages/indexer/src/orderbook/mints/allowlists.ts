import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type AllowlistItem = {
  address: string;
  maxMints?: string;
  // Original price (which will potentially get included in the merkle proof)
  price?: string;
  // Actual price (which includes fees)
  actualPrice?: string;
};

export const createAllowlist = async (id: string, allowlist: AllowlistItem[]) => {
  if (!allowlist.length) {
    throw new Error("Empty allowlist");
  }

  const allowlistExists = await idb.oneOrNone(
    `
      SELECT
        1
      FROM allowlists
      WHERE allowlists.id = $/id/
    `,
    { id }
  );
  if (!allowlistExists) {
    await idb.none(
      `
        INSERT INTO allowlists (
          id
        ) VALUES (
          $/id/
        )
      `,
      { id }
    );
  }

  const allowlistItemsExist = await idb.oneOrNone(
    `
      SELECT
        1
      FROM allowlists_items
      WHERE allowlists_items.allowlist_id = $/id/
      LIMIT 1
    `,
    { id }
  );
  if (!allowlistItemsExist) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    const columns = new pgp.helpers.ColumnSet(
      ["allowlist_id", "index", "address", "max_mints", "price", "actual_price"],
      {
        table: "allowlists_items",
      }
    );
    for (let i = 0; i < allowlist.length; i++) {
      values.push({
        allowlist_id: id,
        index: i,
        address: toBuffer(allowlist[i].address),
        max_mints: allowlist[i].maxMints ?? null,
        price: allowlist[i].price ?? null,
        actual_price: allowlist[i].actualPrice ?? null,
      });
    }

    await idb.none(
      pgp.helpers.insert(values, columns, "allowlists_items") + " ON CONFLICT DO NOTHING"
    );
  }
};
