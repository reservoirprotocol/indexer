import { TypedDataField } from "@ethersproject/abstract-signer";

/** EIP712 type data */
export type EIP712TypedData = Record<string, Array<TypedDataField>>;

export type OrderKind = "single-token" | "contract-wide";

export enum QuoteType {
  Bid,
  Ask,
}

export enum CollectionType {
  ERC721,
  ERC1155,
}

/** List of trading strategies */
export enum StrategyType {
  standard = 0,
  collection = 1,
  collectionWithMerkleTree = 2,
}

export enum MerkleTreeNodePosition {
  Left,
  Right,
}

export type MerkleTreeNode = {
  value: string;
  position: MerkleTreeNodePosition;
};

export type MerkleTree = {
  root: string;
  proof: MerkleTreeNode[];
};

export type MakerOrderParams = {
  kind?: OrderKind;

  quoteType: QuoteType;
  globalNonce: string;
  subsetNonce: string;
  orderNonce: string;
  strategyId: number;
  collectionType: CollectionType;

  collection: string;
  currency: string;
  signer: string;

  startTime: number;
  endTime: number;
  price: string;
  itemIds: string[];
  amounts: string[];

  additionalParameters: string;
  signature?: string;
  merkleTree?: MerkleTree;
};

export type TakerOrderParams = {
  recipient: string;
  additionalParameters: string;
};
