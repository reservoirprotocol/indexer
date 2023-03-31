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
      order: Sdk.SeaportV11.Order;
    }
  | {
      kind: "seaport-partial";
      order: Sdk.SeaportBase.Types.PartialOrder;
    }
  | {
      kind: "seaport-v1.4";
      order: Sdk.SeaportV14.Order;
    }
  | {
      kind: "seaport-v1.4-partial";
      order: Sdk.SeaportBase.Types.PartialOrder;
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
    }
  | {
      kind: "superrare";
      order: Sdk.SuperRare.Order;
    };

// Listings

// Basic details for filling listings
export type ListingFillDetails = {
  orderId: string;
  contractKind: "erc721" | "erc1155";
  contract: string;
  tokenId: string;
  currency: string;
  price: string;
  source?: string;
  isFlagged?: boolean;
  // Relevant for partially-fillable orders
  amount?: number | string;
  fees?: Fee[];
};
export type ListingDetails = GenericOrder & ListingFillDetails;

// For supporting filling listings having different underlying currencies
export type PerCurrencyListingDetails = {
  [currency: string]: ListingDetails[];
};

export type FillListingsResult = {
  txs: {
    approvals: FTApproval[];
    permits: FTPermit[];
    txData: TxData;
    orderIds: string[];
  }[];
  success: { [orderId: string]: boolean };
};

// Bids

// Basic details for filling bids
export type BidFillDetails = {
  orderId: string;
  contractKind: "erc721" | "erc1155";
  contract: string;
  tokenId: string;
  // Relevant for partially-fillable orders
  amount?: number | string;
  // Relevant for merkle orders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraArgs?: any;
  // Relevant for partial Seaport orders
  owner?: string;
  isProtected?: boolean;
  fees?: Fee[];
};
export type BidDetails = GenericOrder & BidFillDetails;

export type FillBidsResult = {
  txData: TxData;
  approvals: NFTApproval[];
  permits: NFTPermit[];
  success: boolean[];
};

// Swaps

export type PerPoolSwapDetails = {
  [pool: string]: SwapDetail[];
};

export type SwapDetail = {
  tokenIn: string;
  tokenOut: string;
  tokenOutAmount: BigNumberish;
  recipient: string;
  refundTo: string;
  details: ListingDetails[];
  executionIndex: number;
};
