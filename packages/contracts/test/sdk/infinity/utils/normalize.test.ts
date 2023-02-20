import * as Infinity from "@reservoir0x/sdk/src/infinity";
import { lc } from "@reservoir0x/sdk/src/utils";
import { expect } from "chai";

describe("Infinity - Normalize Order Parameters", () => {
  const commonOrderParams: Omit<Infinity.Types.OrderInput, "nfts"> = {
    isSellOrder: true,
    signer: "0x0000000000000000000000000000000000000000",
    numItems: 1,
    startPrice: "0",
    endPrice: "0",
    startTime: 0,
    endTime: 0,
    nonce: "0",
    maxGasPrice: "0",
    complication: "0x0000000000000000000000000000000000000000",
    extraParams: "",
    currency: "0x0000000000000000000000000000000000000000"
  };

  it("Merges nfts by collection", () => {
    const collectionA = "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e";
    const nfts: Infinity.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
      {
        collection: collectionA,
        tokens: [{ tokenId: "2", numTokens: 1 }],
      },
    ];

    const orderInput: Infinity.Types.OrderInput = {
      ...commonOrderParams,
      nfts,
    };

    const res = Infinity.normalize(orderInput);

    expect(res.nfts.length).to.equal(1);
    expect(res.nfts[0].collection).to.equal(lc(collectionA));
    expect(res.nfts[0].tokens.length).to.equal(2);
  });

  it("Throws when mixing collection and token id orders for the same collection", () => {
    const collectionA = "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e";
    const nftsWithTokenIdOrderFirst: Infinity.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
      {
        collection: collectionA,
        tokens: [],
      },
    ];

    const orderInput1: Infinity.Types.OrderInput = {
      ...commonOrderParams,
      nfts: nftsWithTokenIdOrderFirst,
    };
    expect(() => Infinity.normalize(orderInput1)).throws(
      Infinity.Errors.InvalidOrderReason.MixingTypes
    );

    const nftsWithTokenIdOrderSecond: Infinity.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [],
      },
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
    ];

    const orderInput2: Infinity.Types.OrderInput = {
      ...commonOrderParams,
      nfts: nftsWithTokenIdOrderSecond,
    };

    expect(() => Infinity.normalize(orderInput2)).throws(
      Infinity.Errors.InvalidOrderReason.MixingTypes
    );
  });

  it("Throws when duplicate token ids are passed for the same collection", () => {
    const collectionA = "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e";
    const nfts: Infinity.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
    ];

    const orderInput: Infinity.Types.OrderInput = {
      ...commonOrderParams,
      nfts,
    };

    expect(() => Infinity.normalize(orderInput)).throws(
      Infinity.Errors.InvalidOrderReason.DuplicateTokenId
    );
  });
});
