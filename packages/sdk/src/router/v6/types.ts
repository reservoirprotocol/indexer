import { BigNumberish } from "@ethersproject/bignumber";

import * as Sdk from "../../index";
import { TxData } from "../../utils";
import { Permit } from "./permit";

// NFT

export type NFTToken = {
  kind: "erc721" | "erc1155";
  contract: string;
  tokenId: BigNumberish;
  amount?: BigNumberish;
};

export type NFTApproval = {
  orderIds: string[];
  contract: string;
  owner: string;
  operator: string;
  txData: TxData;
};

// FT

export type FTApproval = {
  currency: string;
  amount: BigNumberish;
  owner: string;
  operator: string;
  txData: TxData;
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

export type PreSignature = {
  kind: "payment-processor-take-order";
  signer: string;
  signature?: string;
  uniqueId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

export type TxTags = {
  // Number of listings for each order kind
  listings?: { [orderKind: string]: number };
  // Number of bids for each order kind
  bids?: { [orderKind: string]: number };
  // Number of mints
  mints?: number;
  // Number of swaps
  swaps?: number;
  // Number of fees on top
  feesOnTop?: number;
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
      kind: "seaport-v1.4";
      order: Sdk.SeaportV14.Order;
    }
  | {
      kind: "seaport-v1.5";
      order: Sdk.SeaportV15.Order;
    }
  | {
      kind: "seaport-v1.5-partial";
      order: Sdk.SeaportBase.Types.OpenseaPartialOrder;
    }
  | {
      kind: "seaport-v1.5-partial-okx";
      order: Sdk.SeaportBase.Types.OkxPartialOrder;
    }
  | {
      kind: "alienswap";
      order: Sdk.Alienswap.Order;
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
      kind: "ditto";
      order: Sdk.Ditto.Order;
    }
  | {
      kind: "zora";
      order: Sdk.Zora.Order;
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
      kind: "blur";
      order: Sdk.Blur.Order;
    }
  | {
      kind: "blur-bid";
      order: Sdk.Blur.Types.BlurBidPool;
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
      kind: "superrare";
      order: Sdk.SuperRare.Order;
    }
  | {
      kind: "looks-rare-v2";
      order: Sdk.LooksRareV2.Order;
    }
  | {
      kind: "sudoswap-v2";
      order: Sdk.SudoswapV2.Order;
    }
  | {
      kind: "caviar-v1";
      order: Sdk.CaviarV1.Order;
    }
  | {
      kind: "payment-processor";
      order: Sdk.PaymentProcessor.Order;
    }
  | {
      kind: "payment-processor-v2";
      order: Sdk.PaymentProcessorV2.Order;
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
  // Relevant for special orders (eg. signed orders)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraArgs?: any;
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
    txData: TxData;
    txTags?: TxTags;
    orderIds: string[];
    permits: Permit[];
    preSignatures: PreSignature[];
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
  price: string;
  currency: string;
  builtInFeeBps?: number;
  source?: string;
  // Relevant for partially-fillable orders
  amount?: number | string;
  // Relevant for merkle orders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraArgs?: any;
  // Relevant for partial Seaport orders
  owner?: string;
  isProtected?: boolean;
  fees?: Fee[];
  permit?: Permit;
};
export type BidDetails = GenericOrder & BidFillDetails;

export type FillBidsResult = {
  preTxs: {
    kind: "permit";
    txData: TxData;
    orderIds: string[];
  }[];
  txs: {
    approvals: NFTApproval[];
    ftApprovals: FTApproval[];
    txData: TxData;
    txTags?: TxTags;
    orderIds: string[];
    preSignatures: PreSignature[];
  }[];
  success: { [orderId: string]: boolean };
};

// Mints

// Basic details for filling mints
export type MintDetails = {
  orderId: string;
  txData: TxData;
  fees: Fee[];
  token: string;
  quantity: number;
  comment?: string;
};

export type FillMintsResult = {
  txs: {
    txData: TxData;
    txTags?: TxTags;
    orderIds: string[];
  }[];
  success: { [orderId: string]: boolean };
};

// Transfers

export type TransfersResult = {
  txs: {
    approvals: NFTApproval[];
    txData: TxData;
  }[];
};

// Swaps

export type BuySwapDetail = {
  tokenIn: string;
  tokenOut: string;
  tokenOutAmount: BigNumberish;
  recipient: string;
  refundTo: string;
  details: ListingDetails[];
  txIndex?: number;
  executionIndex?: number;
};

export type PerPoolBuySwapDetails = {
  [pool: string]: BuySwapDetail[];
};

export type SellSwapDetail = {
  tokenIn: string;
  tokenOut: string;
  tokenInAmount: BigNumberish;
  recipient: string;
  refundTo: string;
  details: BidDetails[];
  txIndex?: number;
  executionIndex?: number;
};

export type PerPoolSellSwapDetails = {
  [pool: string]: SellSwapDetail[];
};
