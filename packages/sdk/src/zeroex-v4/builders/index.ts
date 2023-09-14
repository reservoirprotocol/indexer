import { ContractWideBuilder } from "./contract-wide";
import { SingleTokenBuilder } from "./single-token";
import { BitVectorTokenListBuilder } from "./token-list/bit-vector";
import { PackedListTokenListBuilder } from "./token-list/packed-list";
import { TokenRangeBuilder } from "./token-range";

export const Builders = {
  ContractWide: ContractWideBuilder,
  SingleToken: SingleTokenBuilder,
  TokenList: {
    BitVector: BitVectorTokenListBuilder,
    PackedList: PackedListTokenListBuilder,
  },
  TokenRange: TokenRangeBuilder,
};
