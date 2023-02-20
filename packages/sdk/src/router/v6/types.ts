import { BigNumberish } from "@ethersproject/bignumber";

import * as Sdk from "../../index";
import { TxData } from "../../utils";

import * as UniswapPermit from "./permits/permit2";
import * as SeaportPermit from "./permits/seaport";

// Approvals and permits

// NFTs

export type NFTToken = {
  kind: "erc721" | "erc1155";
  contract: string;
  tokenId: BigNumberish;
  amount?: BigNumberish;
};

export type NFTApproval = {
  contract: string;
  owner: string;
  operator: string;
  txData: TxData;
};

export type NFTPermit = {
  tokens: NFTToken[];
  details: {
    kind: "seaport";
    data: SeaportPermit.Data;
  };
};

// FTs

export type FTApproval = {
  currency: string;
  owner: string;
  operator: string;
  txData: TxData;
};

export type FTPermit = {
  currencies: string[];
  details: {
    kind: "permit2";
    data: UniswapPermit.Data;
  };
};

// Misc

export type ExecutionInfo = {
  module: string;
  data: string;
  value: BigNumberish;
};

export type Fee = {
  recipient: string;
  amount: BigNumberish;
};

// Orders

export type GenericOrder =
  | {
      kind: "foundation";
      order: Sdk.Foundation.Order;
    }
  | {
      kind: "looks-rare";
      order: Sdk.LooksRare.Order;
    }
  | {
      kind: "x2y2";
      order: Sdk.X2Y2.Order;
    }
  | {
      kind: "zeroex-v4";
      order: Sdk.ZeroExV4.Order;
    }
  | {
      kind: "seaport";
      order: Sdk.Seaport.Order;
    }
  | {
      kind: "seaport-partial";
      order: Sdk.Seaport.Types.PartialOrder;
    }
  | {
      kind: "seaport-v1.2";
      order: Sdk.SeaportV12.Order;
    }
  | {
      kind: "seaport-v1.2-partial";
      order: Sdk.SeaportV12.Types.PartialOrder;
    }
  | {
      kind: "cryptopunks";
      order: Sdk.CryptoPunks.Order;
    }
  | {
      kind: "sudoswap";
      order: Sdk.Sudoswap.Order;
    }
  | {
      kind: "zora";
      order: Sdk.Zora.Order;
    }
  | {
      kind: "universe";
      order: Sdk.Universe.Order;
    }
  | {
      kind: "element";
      order: Sdk.Element.Order;
    }
  | {
      kind: "rarible";
      order: Sdk.Rarible.Order;
    }
  | {
      kind: "infinity";
      order: Sdk.Infinity.Order;
    }
  | {
      kind: "forward";
      order: Sdk.Forward.Order;
    }
  | {
      kind: "blur";
      order: Sdk.Blur.Order;
    }
  | {
      kind: "manifold";
      order: Sdk.Manifold.Order;
    }
  | {
      kind: "nftx";
      order: Sdk.Nftx.Order;
    }
  | {
      kind: "flow";
      order: Sdk.Flow.Order;
    };

export type ListingFillDetails = {
  contractKind: "erc721" | "erc1155";
  contract: string;
  tokenId: string;
  currency: string;
  // Relevant for partially-fillable orders
  amount?: number | string;
  fees?: Fee[];
};
export type ListingDetails = GenericOrder & ListingFillDetails;

export type BidFillDetails = {
  contractKind: "erc721" | "erc1155";
  contract: string;
  tokenId: string;
  // Relevant for partially-fillable orders
  amount?: number | string;
  // Relevant for merkle orders
  extraArgs?: any;
  // Relevant for partial Seaport orders
  owner?: string;
  fees?: Fee[];
};
export type BidDetails = GenericOrder & BidFillDetails;

// For keeping track of each listing's position in the original array
export type ListingDetailsExtracted = {
  originalIndex: number;
} & ListingDetails;

// For supporting filling listings having different underlying currencies
export type PerCurrencyDetails = {
  [currency: string]: ListingDetailsExtracted[];
};
