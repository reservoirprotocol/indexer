import { ContractWideErc721Builder } from "./contract-wide/erc721";
import { ContractWideErc1155Builder } from "./contract-wide/erc1155";
import { SingleTokenErc721BuilderV1 } from "./single-token/v1/erc721";
import { SingleTokenErc721BuilderV2 } from "./single-token/v2/erc721";
import { SingleTokenErc1155BuilderV1 } from "./single-token/v1/erc1155";
import { SingleTokenErc1155BuilderV2 } from "./single-token/v2/erc1155";
import { TokenListErc721Builder } from "./token-list/erc721";
import { TokenListErc1155Builder } from "./token-list/erc1155";
import { TokenRangeErc721Builder } from "./token-range/erc721";
import { TokenRangeErc1155Builder } from "./token-range/erc1155";

export const Builders = {
  Erc721: {
    ContractWide: ContractWideErc721Builder,
    SingleToken: {
      V1: SingleTokenErc721BuilderV1,
      V2: SingleTokenErc721BuilderV2,
    },
    TokenList: TokenListErc721Builder,
    TokenRange: TokenRangeErc721Builder,
  },
  Erc1155: {
    ContractWide: ContractWideErc1155Builder,
    SingleToken: {
      V1: SingleTokenErc1155BuilderV1,
      V2: SingleTokenErc1155BuilderV2,
    },
    TokenList: TokenListErc1155Builder,
    TokenRange: TokenRangeErc1155Builder,
  },
};
