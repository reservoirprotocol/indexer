import { redb, idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type FtApproval = {
  token: string;
  owner: string;
  spender: string;
  value: string;
};

export const saveFtApproval = async (ftApproval: FtApproval): Promise<FtApproval> => {
  await idb.none(
    `
      INSERT INTO ft_approvals (
        token,
        owner,
        spender,
        value
      ) VALUES (
        $/token/,
        $/owner/,
        $/spender/,
        $/value/
      )
      ON CONFLICT (token, owner, spender)
      DO UPDATE SET
        value = $/value/
    `,
    {
      token: toBuffer(ftApproval.token),
      owner: toBuffer(ftApproval.owner),
      spender: toBuffer(ftApproval.spender),
      value: ftApproval.value,
    }
  );

  return ftApproval;
};

export const getFtApproval = async (
  token: string,
  owner: string,
  spender: string
): Promise<FtApproval | undefined> =>
  redb
    .oneOrNone(
      `
        SELECT
          ft_approvals.value
        FROM ft_approvals
        WHERE ft_approvals.token = $/token/
          AND ft_approvals.owner = $/owner/
          AND ft_approvals.spender = $/spender/
      `,
      {
        token: toBuffer(token),
        owner: toBuffer(owner),
        spender: toBuffer(spender),
      }
    )
    .then((result) =>
      result
        ? {
            token,
            owner,
            spender,
            value: result.value,
          }
        : undefined
    );
