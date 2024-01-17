import { Interface } from "@ethersproject/abi";
import { EventData } from "@/events-sync/data";

export const listingCreated721: EventData = {
  kind: "palette",
  subKind: "palette-listing-created-721",
  topic: "0xf02186fdcc0f5563d62d8f5cc18abc28dbd60d22b492aa0419fc279d0f161930",
  numTopics: 4,
  abi: new Interface([
    `event ListingCreated721(
      address indexed lister,
      address indexed collection,
      uint256 indexed tokenId,
      uint256 price,
      address privateBuyer,
      uint256 deadline,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const listingModified721: EventData = {
  kind: "palette",
  subKind: "palette-listing-modified-721",
  topic: "0xec6ec38c7019263bd088b445aa311ed9656977c4a9f69a1973efc4a785af9b56",
  numTopics: 4,
  abi: new Interface([
    `event ListingModified721(
      address indexed lister,
      address indexed collection,
      uint256 indexed tokenId,
      uint256 price,
      address privateBuyer,
      uint256 deadline,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const filledOrder721: EventData = {
  kind: "palette",
  subKind: "palette-filled-order-721",
  topic: "0xd52a9b401a4d9cc55aa57d90294b3a3ad964b1f74a5f559c73cbd8e462f40041",
  numTopics: 4,
  abi: new Interface([
    `event FilledOrder721(
      address indexed collection,
      uint256 indexed tokenId,
      address indexed purchaser,
      uint256 listingPrice
    )`,
  ]),
};

export const removedListing721: EventData = {
  kind: "palette",
  subKind: "palette-removed-listing-721",
  topic: "0x9052081bee03c7da061ce5fd645682e4ceb87f9e11d43f07ed54a2f6dbbbee52",
  numTopics: 4,
  abi: new Interface([
    `event RemovedListing721(
      address indexed collection,
      uint256 indexed tokenId,
      address indexed lister
    )`,
  ]),
};

export const specificBidAccepted721: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-accepted-721",
  topic: "0xbc705c64c1048ec1d85d891a01a32cc9b1d1fc620ae0a2e2773b07f86e405aa2",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidAccepted721(
      address indexed collection,
      address indexed bidder,
      address indexed owner,
      uint256 tokenId,
      uint256 bidAmt
    )`,
  ]),
};

export const collectionOfferAccepted721: EventData = {
  kind: "palette",
  subKind: "palette-collection-offer-accepted-721",
  topic: "0x2bd5e00d6b934e056cdcd09df978d34ea6d78814f17d7b8c03afbeb918e2ee70",
  numTopics: 4,
  abi: new Interface([
    `event CollectionOfferAccepted721(
      address indexed collection,
      address indexed bidder,
      address indexed owner,
      uint256 tokenId,
      uint256 bidAmt
    )`,
  ]),
};

export const listingCreated1155: EventData = {
  kind: "palette",
  subKind: "palette-listing-created-1155",
  topic: "0x85e52dcdbcae6116ae2543859d492f0c20c92432e65077bb1413844518b96446",
  numTopics: 4,
  abi: new Interface([
    `event ListingCreated1155(
      address indexed lister,
      address indexed collection,
      uint256 indexed tokenId,
      uint256 tokenQuantity,
      uint256 price,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const listingModified1155: EventData = {
  kind: "palette",
  subKind: "palette-listing-modified-1155",
  topic: "0x3e33dcdbea12464daf4acadc5e71697a83c7149b4f88fda2b207e78aee649db6",
  numTopics: 4,
  abi: new Interface([
    `event ListingModified1155(
      address indexed lister,
      address indexed collection,
      uint256 indexed tokenId,
      uint256 tokenQuantity,
      uint256 price,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const specificBidAccepted1155: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-accepted-1155",
  topic: "0x84fac31bcd2459b7c1b22877d0cb54b8130ca87ae7889409fdd41cc5a5afd1c9",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidAccepted1155(
      address indexed collection,
      address indexed bidder,
      address indexed owner,
      uint256 tokenId,
      uint256 fills,
      uint256 bidAmt
    )`,
  ]),
};

export const removedListing1155: EventData = {
  kind: "palette",
  subKind: "palette-removed-listing-1155",
  topic: "0xe4902f677bdd63c55ba1a1d6f2e754a4d4d1437b1603ee7065b80eb7ecc5dcf5",
  numTopics: 4,
  abi: new Interface([
    `event RemovedListing1155(
      address indexed collection,
      uint256 indexed tokenId,
      address indexed lister,
      uint256 tokenQuantity
    )`,
  ]),
};

export const filledOrder1155: EventData = {
  kind: "palette",
  subKind: "palette-filled-order-1155",
  topic: "0x88c5331ab04e852eee89948fa2cb9db951c378eb41ed489d2c89ba0297ff8e93",
  numTopics: 4,
  abi: new Interface([
    `event FilledOrder1155(
      address indexed collection,
      uint256 indexed tokenId,
      address indexed purchaser,
      uint256 listingPrice,
      uint256 tokenQuantity
    )`,
  ]),
};

export const collectionOfferAccepted1155: EventData = {
  kind: "palette",
  subKind: "palette-collection-offer-accepted-1155",
  topic: "0x1e3b4c36c317c3d7244318e1ee5173d75c7fffd31f7c2551401bd401d4818e17",
  numTopics: 4,
  abi: new Interface([
    `event CollectionOfferAccepted1155(
      address indexed collection,
      address indexed bidder,
      address indexed owner,
      uint256 tokenId,
      uint256 tokenQuantity,
      uint256 bidAmt
    )`,
  ]),
};

export const specificBidCreated721: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-created-721",
  topic: "0x1a006178405860e8048e57a9093d8718c9b679f7f934a9eb3aac0660a503da01",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidCreated721(
      address indexed collection,
      address indexed bidder,
      uint256 indexed tokenId,
      uint256 bidAmt,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const specificBidCreated1155: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-created-1155",
  topic: "0x972bae6fbc581753d1ed2f4e4c1223801eb3d74f67c3a6e51f0c778e42d378dd",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidCreated1155(
      address indexed collection,
      address indexed bidder,
      uint256 indexed tokenId,
      uint256 bidAmt,
      uint256 bidQuantity,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const collectionOfferCreated: EventData = {
  kind: "palette",
  subKind: "palette-collection-offer-created",
  topic: "0x73cefc3ca8656511793961fb0b87bd17010b6cf57e1aac0b6bc177d54ee4b10a",
  numTopics: 4,
  abi: new Interface([
    `event CollectionOfferCreated(
      address indexed collection,
      address indexed bidder,
      bool indexed isERC721,
      uint256 bidValue,
      uint256 bidQuantity,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const specificBidModified721: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-modified-721",
  topic: "0xb7919d93702deaacb7fc0ff5d244209201188e1094bdf67a714adaa91ef416f5",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidModified721(
      address indexed collection,
      address indexed bidder,
      uint256 indexed tokenId,
      uint256 bidAmt,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const specificBidModified1155: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-modified-1155",
  topic: "0xed7bcb30a9bdff26074f49f48b77a8c61259b19d7047ee6e5df36456107a121f",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidModified1155(
      address indexed collection,
      address indexed bidder,
      uint256 indexed tokenId,
      uint256 bidAmt,
      uint256 bidQuantity,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const collectionOfferModified: EventData = {
  kind: "palette",
  subKind: "palette-collection-offer-modified",
  topic: "0xa51fb00d48359173e995a18da4783ba66b41391db1c6455ea0b6b352318a8747",
  numTopics: 4,
  abi: new Interface([
    `event CollectionOfferModified(
      address indexed collection,
      address indexed bidder,
      bool indexed isERC721,
      uint256 bidValue,
      uint256 bidQuantity,
      address referrer,
      uint256 feePercentage,
      address hook
    )`,
  ]),
};

export const specificBidRemoved721: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-removed-721",
  topic: "0x0d0fdc853433687442e150bbbd793272e43636dc965df1cf5d28b3cb1e0b5c8d",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidRemoved721(
      address indexed collection,
      address indexed bidder,
      uint256 offerAmount,
      uint256 indexed tokenId
    )`,
  ]),
};

export const specificBidRemoved1155: EventData = {
  kind: "palette",
  subKind: "palette-specific-bid-removed-1155",
  topic: "0x4130b1bf29d1cad531c8e71b3889f97618051633f55ed1ab8c481ab6214f1e5d",
  numTopics: 4,
  abi: new Interface([
    `event SpecificBidRemoved1155(
      address indexed collection,
      address indexed bidder,
      uint256 indexed tokenId,
      uint256 offerAmount,
      uint256 tokenQuantity
    )`,
  ]),
};
export const collectionOfferCancelled: EventData = {
  kind: "palette",
  subKind: "palette-collection-offer-cancelled",
  topic: "0xadae72553046ffc3f7d91fa67a1b7815424c7608d200b5d3101e29c1b8561704",
  numTopics: 3,
  abi: new Interface([
    `event CollectionOfferCancelled(
      address indexed collection,
      address indexed bidder,
      bool isERC721,
      uint256 offerAmount,
      uint256 offerQuantity
    )`,
  ]),
};

// console.log({
// listingCreated721: listingCreated721.abi.getEventTopic("ListingCreated721"),
// listingModified721: listingModified721.abi.getEventTopic('ListingModified721'),
// filledOrder721: filledOrder721.abi.getEventTopic('FilledOrder721'),
// removedListing721: removedListing721.abi.getEventTopic('RemovedListing721'),
// specificBidAccepted721: specificBidAccepted721.abi.getEventTopic('SpecificBidAccepted721'),
// collectionOfferAccepted721: collectionOfferAccepted721.abi.getEventTopic('CollectionOfferAccepted721'),

// listingCreated1155: listingCreated1155.abi.getEventTopic('ListingCreated1155'),
// listingModified1155: listingModified1155.abi.getEventTopic('ListingModified1155'),
// specificBidAccepted1155: specificBidAccepted1155.abi.getEventTopic('SpecificBidAccepted1155'),
// removedListing1155: removedListing1155.abi.getEventTopic('RemovedListing1155'),
// filledOrder1155: filledOrder1155.abi.getEventTopic("FilledOrder1155"),
// collectionOfferAccepted1155: collectionOfferAccepted1155.abi.getEventTopic(
//   "CollectionOfferAccepted1155"
// ),

// specificBidCreated721: specificBidCreated721.abi.getEventTopic("SpecificBidCreated721"),
// specificBidCreated1155: specificBidCreated1155.abi.getEventTopic("SpecificBidCreated1155"),

// collectionOfferCreated: collectionOfferCreated.abi.getEventTopic('CollectionOfferCreated'),
// specificBidModified721: specificBidModified721.abi.getEventTopic('SpecificBidModified721'),
// specificBidModified1155: specificBidModified1155.abi.getEventTopic('SpecificBidModified1155'),
// collectionOfferModified: collectionOfferModified.abi.getEventTopic('CollectionOfferModified'),
// specificBidRemoved721: specificBidRemoved721.abi.getEventTopic("SpecificBidRemoved721"),
// specificBidRemoved1155: specificBidRemoved1155.abi.getEventTopic('SpecificBidRemoved1155'),
// collectionOfferCancelled: collectionOfferCancelled.abi.getEventTopic('CollectionOfferCancelled'),
// });
