import { constants } from "ethers";
import { Eip712MerkleTree } from "./Eip712MerkleTree";
import { getBatchOrderTypes } from "../order";
import { MakerOrderParams as Maker, QuoteType, StrategyType, CollectionType } from "../types";

const defaultMaker: Maker = {
  quoteType: QuoteType.Bid,
  globalNonce: "0",
  subsetNonce: "0",
  orderNonce: "0",
  strategyId: StrategyType.standard,
  collectionType: CollectionType.ERC721,
  collection: constants.AddressZero,
  currency: constants.AddressZero,
  signer: constants.AddressZero,
  startTime: 0,
  endTime: 0,
  price: "0",
  itemIds: ["0"],
  amounts: ["0"],
  additionalParameters: "0x",
};

export class Eip712MakerMerkleTree extends Eip712MerkleTree<Maker> {
  constructor(public makerOrders: Maker[]) {
    const height = Eip712MerkleTree.getTreeHeight(makerOrders.length);
    const types = getBatchOrderTypes(height);

    super(types, "Maker", defaultMaker, makerOrders, height);
  }
}
