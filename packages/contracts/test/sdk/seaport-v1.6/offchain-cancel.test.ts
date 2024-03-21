/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import * as indexerHelper from "../../indexer-helper";
import { getChainId, setupNFTs } from "../../utils";

describe("SeaportV1.6 - OffChain Cancel Integration Test", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    // Reset Indexer
    await indexerHelper.reset();
    [deployer, alice, bob] = await ethers.getSigners();
    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(async () => {
    // await reset();
  });

  const testCase = async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const boughtTokenId = Math.floor(Math.random() * 100000);
    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);
    await weth.deposit(seller, price);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    // Store collection
    await indexerHelper.doOrderSaving({
      contract: erc721.address,
      kind: "erc721",
      nfts: [
        {
          collection: erc721.address,
          tokenId: boughtTokenId.toString(),
          owner: seller.address,
        },
      ],
      orders: [],
    });

    const bidParams = {
      params: [
        {
          orderKind: "seaport-v1.6",
          options: {
            "seaport-v1.6": {
              useOffChainCancellation: true,
            },
          },
          orderbook: "reservoir",
          automatedRoyalties: true,
          excludeFlaggedTokens: false,
          currency: Common.Addresses.WNative[chainId],
          weiPrice: "1000000", // 1 USDC
          token: `${erc721.address}:${boughtTokenId}`,
        },
      ],
      maker: buyer.address,
    };

    const bidResponse = await indexerHelper.executeBidV5(bidParams);

    const saveOrderStep2 = bidResponse.steps.find((c: any) => c.id === "order-signature");

    if (!saveOrderStep2) {
      return;
    }

    const orderSignature2 = saveOrderStep2.items[0];

    const bidMessage = orderSignature2.data.sign;
    const offerSignature = await buyer._signTypedData(
      bidMessage.domain,
      bidMessage.types,
      bidMessage.value
    );

    const postRequest = orderSignature2.data.post;

    const orderSaveResult = await indexerHelper.callStepAPI(
      postRequest.endpoint,
      offerSignature,
      postRequest.body
    );
    const orderId = orderSaveResult.results[0].orderId;

    if (orderSaveResult.error) {
      return;
    }

    const cancelParams = {
      orderIds: [orderId],
      orderKind: "seaport-v1.6",
    };

    const cancelResponse = await indexerHelper.executeCancelV3(cancelParams);

    const cancellationSignatureStep = cancelResponse.steps.find(
      (c: any) => c.id === "cancellation-signature"
    );
    const cancellationSignature = cancellationSignatureStep.items[0];

    {
      const message = cancellationSignature.data.sign;
      const signature = await buyer._signTypedData(message.domain, message.types, message.value);

      const postRequest = cancellationSignature.data.post;
      const saveResult = await indexerHelper.callStepAPI(
        postRequest.endpoint,
        signature,
        postRequest.body
      );
      expect(saveResult.message).eq("Success");
    }
  };

  it("create and offchain cancel", async () => testCase());
});
