/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import * as Common from "@reservoir0x/sdk/src/common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as Sdk from "@reservoir0x/sdk/src";
import * as indexerHelper from "../../indexer-helper";
import { getChainId, bn, setupNFTs } from "../../utils";
import { parseEther, parseUnits } from "@ethersproject/units";
import { expect } from "chai";
import { MaxUint256 } from "@ethersproject/constants";
import { splitSignature } from "@ethersproject/bytes";
import { Interface } from "@ethersproject/abi";

describe("PermitBidding - Indexer Integration Test", () => {
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

  const testCase = async (isCancel = false, isExpire = false) => {
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
      orders: [
      ],
    });

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    // Get some USDC
    const swapExecutions = [
      {
        module: router.contracts.swapModule.address,
        data: router.contracts.swapModule.interface.encodeFunctionData("ethToExactOutput", [
          [
            {
              params: {
                tokenIn: Sdk.Common.Addresses.WNative[chainId],
                tokenOut: Sdk.Common.Addresses.Usdc[chainId][0],
                fee: 500,
                recipient: router.contracts.swapModule.address,
                amountOut: parseUnits("50000", 6),
                amountInMaximum: parseEther("50"),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: buyer.address,
                  amount: parseUnits("50000", 6),
                  toETH: false,
                },
              ],
            },
          ],
          buyer.address,
          true,
        ]),
        // Anything on top should be refunded
        value: parseEther("50"),
      },
    ];

    // const usdc = new Sdk.Common.Helpers.Erc20(ethers.provider, Sdk.Common.Addresses.Usdc[chainId][0]);
    await router.contracts.router.connect(buyer).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const bidParams = {
      "params": [
        {
          "orderKind": "seaport-v1.5",
          "options": {
            "seaport-v1.4": {
              "useOffChainCancellation": true
            },
            "seaport-v1.5": {
              "useOffChainCancellation": true
            }
          },
          "orderbook": "reservoir",
          "automatedRoyalties": true,
          "excludeFlaggedTokens": false,
          "currency": Common.Addresses.Usdc[chainId][0],
          "weiPrice": "1000000", // 1 USDC
          token: `${erc721.address}:${boughtTokenId}`,
        }
      ],
      maker: buyer.address,
      usePermitBidding: true,
      permitBiddingLifetime: isExpire ? 1 : 86400 * 7
    }

    const bidResponse = await indexerHelper.executeBidV5(bidParams);
    const {
      steps
    } = bidResponse;

    // Handle permit approval
    const permitApproval = steps.find((c: any) => c.id === "permit-approval");
    for(const item of permitApproval.items) {
      const eipMessage = item.data.sign;
      const signature = await buyer._signTypedData(
        eipMessage.domain,
        eipMessage.types,
        eipMessage.value
      );

      // Store permit bidding signature
      const permitId = item.data.post.body.id;
      await indexerHelper.savePreSignature(signature, permitId);
    }

    const bidResponse2 = await indexerHelper.executeBidV5(bidParams);

    const saveOrderStep2 = bidResponse2.steps.find((c: any) => c.id === "order-signature");

    if (!saveOrderStep2) {
      // console.log('order failed')
      return
    }

    const orderSignature2 = saveOrderStep2.items[0];

    const bidMessage = orderSignature2.data.sign;
    const offerSignature = await buyer._signTypedData(
      bidMessage.domain,
      bidMessage.types,
      bidMessage.value
    );

    const postRequest = orderSignature2.data.post;

    const orderSaveResult = await indexerHelper.callStepAPI(postRequest.endpoint, offerSignature, postRequest.body);
    const orderId = orderSaveResult.orderId;

    if (orderSaveResult.error) {
      // console.log("save order failed", orderSaveResult)
      return;
    }

    // console.log("orderSaveResult", orderSaveResult)

    if (isCancel) {
      // Permit to others cause permit once changes
      const permitData = await Sdk.Common.Helpers.createPermitMessage(
        {
          chainId: chainId,
          token: Sdk.Common.Addresses.Usdc[chainId][0],
          owner: buyer.address,
          spender: Sdk.PaymentProcessor.Addresses.Exchange[chainId],
          amount: MaxUint256.toString(),
          deadline: String(Math.floor(Date.now() / 1000) + 86400 * 7),
        },
        ethers.provider
      );

      const permitSignature = await buyer._signTypedData(permitData.domain, permitData.types, permitData.value);
      const {v, r, s} = splitSignature(permitSignature);
        const permitTx = {
          from: buyer.address,
          to: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          data: new Interface([
            `function permit(
              address owner,
              address spender,
              uint256 value,
              uint256 deadline,
              uint8 v,
              bytes32 r,
              bytes32 s
            )`
          ]).encodeFunctionData('permit', [
            permitData.value.owner,
            permitData.value.spender,
            permitData.value.value,
            permitData.value.deadline,
            v,
            r,
            s
          ])
        }

      const permitRes = await buyer.sendTransaction(permitTx)
      const parsedResult = await indexerHelper.doEventParsing(permitRes.hash, false)
      expect(parsedResult.onChainData[0].permitNonceChanges.length).to.eq(1);
    }

    const executeResponse = await indexerHelper.executeSellV7({
      items: [
        {
          token: `${erc721.address}:${boughtTokenId}`,
          quantity: 1,
          orderId
        },
      ],
      partial: true,
      taker: seller.address,
      forceRouter: true,
    });

    if (isExpire) {
      expect(executeResponse.message.includes("expired")).to.eq(true);
      return
    }

    if (isCancel) {
      expect(executeResponse.message.includes("No fillable orders")).to.eq(true);
      return
    }

    const allSteps = executeResponse.steps;
    if (!allSteps) {
      // console.log("getExecute failed", executeResponse)
    }
    await seller.sendTransaction(allSteps[0].items[0].data);

    const lastSetp = allSteps[allSteps.length - 1];
    // const tx = await seller.sendTransaction(lastSetp.items[0].data);
    // await tx.wait();
    // bulkPermit
    expect(lastSetp.items[0].data.data.includes("c7460d07")).to.eq(isExpire ? false : true);
  };

  it("create and execute", async () => testCase());
  it("create and cancel", async () => testCase(true));
  it("create and expired", async () => testCase(false, true));
});
