import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

import * as v1 from "@/utils/erc721c/v1";
import * as v2 from "@/utils/erc721c/v2";

export { v1, v2 };

export const refreshConfig = async (contract: string) =>
  Promise.all([v1.refreshConfig(contract), v2.refreshConfig(contract)]);

export const isVerifiedEOA = async (transferValidator: string, address: string) => {
  const result = await idb.oneOrNone(
    `
      SELECT
        1
      FROM erc721c_verified_eoas
      WHERE erc721c_verified_eoas.transfer_validator = $/transferValidator/
        AND erc721c_verified_eoas.address = $/address/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      address: toBuffer(address),
    }
  );
  return Boolean(result);
};

export const saveVerifiedEOA = async (transferValidator: string, address: string) =>
  idb.none(
    `
      INSERT INTO erc721c_verified_eoas(
        transfer_validator,
        address
      ) VALUES (
        $/transferValidator/,
        $/address/
      ) ON CONFLICT DO NOTHING
    `,
    {
      transferValidator: toBuffer(transferValidator),
      address: toBuffer(address),
    }
  );
