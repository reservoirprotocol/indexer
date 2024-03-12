/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as indexerHelper from "../../../indexer-helper";
import { getChainId, setupNFTs } from "../../../utils";
import { testCase } from "./shared";

import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import { expect } from "chai";


describe("PaymentProcessorV201 - Indexer Listing Integration Test", () => {
    const chainId = getChainId();

    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let nico: SignerWithAddress;

    let erc721: Contract;
    let erc721_2: Contract;

    beforeEach(async () => {
        // Reset Indexer
        await indexerHelper.reset();

        [deployer, alice, bob, nico] = await ethers.getSigners();
        ({ erc721 } = await setupNFTs(deployer));
        ({ erc721: erc721_2 } = await setupNFTs(deployer));
    });

    afterEach(async () => {
        // await reset();
        await indexerHelper.reset();
    });

    // it("Fill listing with cancel", async () => {
    //     await testCase({
    //         cancelOrder: true,
    //         bob,
    //         alice,
    //         chainId,
    //         erc721
    //     });
    // });

    // it("Fill Listing via Router API", async () =>
    //     testCase({
    //         isListing: true,
    //         executeByRouterAPI: true,
    //         bob,
    //         alice,
    //         chainId,
    //         erc721
    //     }));

    // it("Fill listing", async () =>
    //     testCase({
    //         isListing: true,
    //         bob,
    //         alice,
    //         chainId,
    //         erc721
    //     }));


    it("Fill bids and transfer failed", async () => {
        const buyer = alice;
        const buyer2 = nico;
        const seller = bob;

        const testOrderKind = "payment-processor-v2.0.1";
        // const testOrderKind = "payment-processor-v2";

        const price = parseEther("1");
        const boughtTokenId = Math.floor(Math.random() * 100000000);
        const boughtTokenId2 = Math.floor(Math.random() * 100000000);
        const weth = new Common.Helpers.WNative(ethers.provider, chainId);

        const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
        const nft2 = new Common.Helpers.Erc721(ethers.provider, erc721_2.address);

        // Mint weth to buyer
        await weth.deposit(buyer, price.mul(4));
        await weth.deposit(buyer2, price.mul(4));

        // Mint erc721 to seller
        await erc721.connect(seller).mint(boughtTokenId);
        await erc721_2.connect(seller).mint(boughtTokenId2);

        // Store collection
        await indexerHelper.doOrderSaving({
            currency: weth.contract.address,
            // Refresh balance incase the local indexer doesn't have the state
            makers: [buyer.address, buyer2.address],

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

        await indexerHelper.doOrderSaving({
            contract: erc721_2.address,
            kind: "erc721",
            nfts: [
                {
                    collection: erc721_2.address,
                    tokenId: boughtTokenId2.toString(),
                    owner: seller.address,
                },
            ],
            orders: [],
        });

        const bidParams = {
            params: [
                {
                    orderKind: testOrderKind,
                    options: {
                        [testOrderKind]: {
                            useOffChainCancellation: true,
                        },
                    },
                    orderbook: "reservoir",
                    automatedRoyalties: true,
                    excludeFlaggedTokens: false,
                    currency: Common.Addresses.WNative[chainId],
                    weiPrice: price.toString(), // 1 USDC
                    token: `${erc721.address}:${boughtTokenId}`,
                },
            ],
            maker: buyer.address,
        };

        const bidResponse = await indexerHelper.executeBidV5(bidParams);
        const bid1 = await indexerHelper.executeSteps(bidResponse.steps, buyer);
        const orderId1 = bid1.find(c => c.step === 'order-signature').result.results[0].orderId

        const bidParams2 = {
            params: [
                {
                    orderKind: testOrderKind,
                    options: {
                        [testOrderKind]: {
                            useOffChainCancellation: true,
                        },
                    },
                    orderbook: "reservoir",
                    automatedRoyalties: true,
                    excludeFlaggedTokens: false,
                    currency: Common.Addresses.WNative[chainId],
                    weiPrice: price.toString(), // 1 USDC
                    token: `${erc721_2.address}:${boughtTokenId2}`,
                },
            ],
            maker: buyer2.address,
        };

        const bidResponse2 = await indexerHelper.executeBidV5(bidParams2);
        const bid2 = await indexerHelper.executeSteps(bidResponse2.steps, buyer2);
        const orderId2 = bid2.find(c => c.step === 'order-signature').result.results[0].orderId

        const sellParams = {
            items: [
                {
                    token: `${erc721.address}:${boughtTokenId}`,
                    quantity: 1,
                    orderId: orderId1,
                },
                {
                    token: `${erc721_2.address}:${boughtTokenId2}`,
                    quantity: 1,
                    orderId: orderId2
                },
            ],
            taker: seller.address,
        };

        const ownerAfterBefore2 = await nft2.getOwner(boughtTokenId2);
        const ownerAfterBefore1 = await nft.getOwner(boughtTokenId);

        const executeResponse = await indexerHelper.executeSellV7(sellParams);
        await indexerHelper.executeSteps(executeResponse.steps, seller);
        const ownerAfter2 = await nft2.getOwner(boughtTokenId2);
        const ownerAfter1 = await nft.getOwner(boughtTokenId);

        expect(ownerAfter2).to.eq(buyer2.address);
        expect(ownerAfter1).to.eq(buyer.address);
    });

    // it("Fill listing with bulk Cancel", async () =>
    //     testCase({
    //         bulkCancel: true,
    //         bob,
    //         alice,
    //         chainId,
    //         erc721
    //     }));

});
