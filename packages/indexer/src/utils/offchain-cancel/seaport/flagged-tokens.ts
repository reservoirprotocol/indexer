import { arrayify } from "@ethersproject/bytes";
import { ReceivedItem } from "@reservoir0x/sdk/dist/seaport-base/types";
import _ from "lodash";

import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";

export class Features {
  private zoneHashBytes: Uint8Array;

  constructor(zoneHash: string) {
    this.zoneHashBytes = arrayify(zoneHash);
  }

  public checkFlagged(): boolean {
    return ((this.zoneHashBytes[0] >> 7) & 1) === 1;
  }
}

const fetchFlaggedTokens = async (consideration: ReceivedItem[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {};

  for (const c of consideration) {
    const [contract, tokenId] = [c.token, c.identifier];

    const tokensFilter = `('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`;
    if (_.isUndefined(query.tokensFilter)) {
      query.tokensFilter = [];
    }

    query.tokensFilter.push(tokensFilter);
  }

  query.tokensFilter = _.join(query.tokensFilter, ",");

  const result = await idb.manyOrNone(
    `
      SELECT
        tokens.contract,
        tokens.token_id,
        tokens.is_flagged
      FROM tokens
      WHERE (tokens.contract, tokens.token_id) IN ($/tokensFilter:raw/)
    `,
    query
  );

  return new Set(
    result.filter((c) => c.is_flagged).map((c) => `${fromBuffer(c.contract)}:${c.token_id}`)
  );
};

export class FlaggedTokensChecker {
  private consideration: ReceivedItem[];
  private flaggedTokens?: Set<string>;

  constructor(consideration: ReceivedItem[]) {
    this.consideration = consideration;
  }

  public async containsFlagged(consideration: ReceivedItem[]): Promise<boolean> {
    if (!this.flaggedTokens) {
      this.flaggedTokens = await this.getFlagged();
    }

    for (const c of consideration) {
      if (this.flaggedTokens.has(`${c.token}:${c.identifier}`)) {
        return true;
      }
    }

    return false;
  }

  private async getFlagged() {
    return fetchFlaggedTokens(this.consideration);
  }
}
