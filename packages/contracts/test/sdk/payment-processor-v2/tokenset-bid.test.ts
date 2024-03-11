/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as PaymentProcessorV2 from "@reservoir0x/sdk/src/payment-processor-v2";
import { expect } from "chai";
import * as indexerHelper from "../../indexer-helper";
import { getChainId, setupNFTs } from "../../utils";

describe("PaymentProcessorV2 - OffChain Cancel Integration Test", () => {
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

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange contract for the buyer
    await weth.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);
    await nft.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Store collection
    await indexerHelper.doOrderSaving({
      contract: erc721.address,
      kind: "erc721",
      nfts: [
        {
          collection: erc721.address,
          tokenId: boughtTokenId.toString(),
          owner: seller.address,
          attributes: [
            {
              key: "Hello",
              value: "world",
              kind: "string",
              rank: 1,
            }
          ]
        },
      ],
      orders: [],
    });

    const bidParams = {
      params: [
        {
          orderKind: "payment-processor-v2",
          options: {
            "payment-processor-v2": {
              useOffChainCancellation: true,
            },
          },
          orderbook: "reservoir",
          automatedRoyalties: true,
          excludeFlaggedTokens: false,
          collection: erc721.address,
          attributeKey: "Hello",
          attributeValue: "world",
          currency: Common.Addresses.WNative[chainId],
          weiPrice: "1000000", // 1 USDC
          // token: `${erc721.address}:${boughtTokenId}`,
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
    console.log('bidMessage', bidMessage)
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

    const executeResponse = await indexerHelper.executeSellV7({
      items: [
        {
          token: `${erc721.address}:${boughtTokenId}`,
          quantity: 1,
          orderId: orderId
        },
      ],
      taker: seller.address,
    });
    const allSteps = executeResponse.steps;
    const lastSetp = allSteps[allSteps.length - 1];
    const transcation = lastSetp.items[0];
    for(const step of allSteps) {
      for(const stepItem of step.items) {
        if (step.kind === "transaction") {
          await seller.sendTransaction(stepItem.data);
        }
      }
    }

    const ownerAfter = await nft.getOwner(boughtTokenId);
    expect(ownerAfter).to.eq(buyer.address);
  };

  it("create tokenset bid and fill", async () => testCase());
});
