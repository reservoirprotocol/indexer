export type OrderKind =
  | "contract-wide"
  | "single-token"
  | "token-list"
  | "bundle-ask";

export enum ItemType {
  NATIVE,
  ERC20,
  ERC721,
  ERC1155,
  ERC721_WITH_CRITERIA,
  ERC1155_WITH_CRITERIA,
}

export enum OrderType {
  FULL_OPEN,
  PARTIAL_OPEN,
  FULL_RESTRICTED,
  PARTIAL_RESTRICTED,
}

export enum BasicOrderType {
  ETH_TO_ERC721_FULL_OPEN,
  ETH_TO_ERC721_PARTIAL_OPEN,
  ETH_TO_ERC721_FULL_RESTRICTED,
  ETH_TO_ERC721_PARTIAL_RESTRICTED,
  ETH_TO_ERC1155_FULL_OPEN,
  ETH_TO_ERC1155_PARTIAL_OPEN,
  ETH_TO_ERC1155_FULL_RESTRICTED,
  ETH_TO_ERC1155_PARTIAL_RESTRICTED,
  ERC20_TO_ERC721_FULL_OPEN,
  ERC20_TO_ERC721_PARTIAL_OPEN,
  ERC20_TO_ERC721_FULL_RESTRICTED,
  ERC20_TO_ERC721_PARTIAL_RESTRICTED,
  ERC20_TO_ERC1155_FULL_OPEN,
  ERC20_TO_ERC1155_PARTIAL_OPEN,
  ERC20_TO_ERC1155_FULL_RESTRICTED,
  ERC20_TO_ERC1155_PARTIAL_RESTRICTED,
  ERC721_TO_ERC20_FULL_OPEN,
  ERC721_TO_ERC20_PARTIAL_OPEN,
  ERC721_TO_ERC20_FULL_RESTRICTED,
  ERC721_TO_ERC20_PARTIAL_RESTRICTED,
  ERC1155_TO_ERC20_FULL_OPEN,
  ERC1155_TO_ERC20_PARTIAL_OPEN,
  ERC1155_TO_ERC20_FULL_RESTRICTED,
  ERC1155_TO_ERC20_PARTIAL_RESTRICTED,
}

export enum Side {
  OFFER,
  CONSIDERATION,
}

export type OfferItem = {
  itemType: ItemType;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
};

export type ConsiderationItem = {
  itemType: ItemType;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
  recipient: string;
};

export type OrderComponents = {
  kind?: OrderKind;
  offerer: string;
  zone: string;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: OrderType;
  startTime: number;
  endTime: number;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  counter: string;
  signature?: string;
};

export type MatchParams = {
  amount?: string;
  criteriaResolvers?: CriteriaResolver[];
};

export type SpentItem = {
  itemType: ItemType;
  token: string;
  identifier: string;
  amount: string;
};

export type ReceivedItem = {
  itemType: ItemType;
  token: string;
  identifier: string;
  amount: string;
  recipient: string;
};

export type CriteriaResolver = {
  orderIndex: number;
  side: Side;
  index: number;
  identifier: string;
  criteriaProof: string[];
};

export type PartialOrder = {
  id: string;
  contract: string;
  tokenId: string;
  unitPrice?: string;
};
