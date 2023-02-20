import * as Flow from "@reservoir0x/sdk/src/flow";
import { lc } from "@reservoir0x/sdk/src/utils";
import { expect } from "chai";

describe("Flow - Normalize Order Parameters", () => {
  const commonOrderParams: Omit<Flow.Types.OrderInput, "nfts"> = {
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
    currency: "0x0000000000000000000000000000000000000000",
    trustedExecution: "0",
  };

  it("Merges nfts by collection", () => {
    const collectionA = "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e";
    const nfts: Flow.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
      {
        collection: collectionA,
        tokens: [{ tokenId: "2", numTokens: 1 }],
      },
    ];

    const orderInput: Flow.Types.OrderInput = {
      ...commonOrderParams,
      nfts,
    };

    const res = Flow.normalize(orderInput);

    expect(res.nfts.length).to.equal(1);
    expect(res.nfts[0].collection).to.equal(lc(collectionA));
    expect(res.nfts[0].tokens.length).to.equal(2);
  });

  it("Throws when mixing collection and token id orders for the same collection", () => {
    const collectionA = "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e";
    const nftsWithTokenIdOrderFirst: Flow.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
      {
        collection: collectionA,
        tokens: [],
      },
    ];

    const orderInput1: Flow.Types.OrderInput = {
      ...commonOrderParams,
      nfts: nftsWithTokenIdOrderFirst,
    };
    expect(() => Flow.normalize(orderInput1)).throws(
      Flow.Errors.InvalidOrderReason.MixingTypes
    );

    const nftsWithTokenIdOrderSecond: Flow.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [],
      },
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
    ];

    const orderInput2: Flow.Types.OrderInput = {
      ...commonOrderParams,
      nfts: nftsWithTokenIdOrderSecond,
    };

    expect(() => Flow.normalize(orderInput2)).throws(
      Flow.Errors.InvalidOrderReason.MixingTypes
    );
  });

  it("Throws when duplicate token ids are passed for the same collection", () => {
    const collectionA = "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e";
    const nfts: Flow.Types.OrderNFTs[] = [
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
      {
        collection: collectionA,
        tokens: [{ tokenId: "1", numTokens: 1 }],
      },
    ];

    const orderInput: Flow.Types.OrderInput = {
      ...commonOrderParams,
      nfts,
    };

    expect(() => Flow.normalize(orderInput)).throws(
      Flow.Errors.InvalidOrderReason.DuplicateTokenId
    );
  });
});
