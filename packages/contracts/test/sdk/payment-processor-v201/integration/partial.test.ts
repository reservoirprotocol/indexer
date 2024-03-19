/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as indexerHelper from "../../../indexer-helper";
import { getChainId, setupNFTs } from "../../../utils";

import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import { expect } from "chai";


describe("PaymentProcessorV201 - Indexer Listing Integration Test", () => {
    const chainId = getChainId();

    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let nico: SignerWithAddress;

    let erc1155: Contract;

    beforeEach(async () => {
        // Reset Indexer
        await indexerHelper.reset();

        [deployer, alice, bob, nico] = await ethers.getSigners();
        ({ erc1155 } = await setupNFTs(deployer));
    });

    afterEach(async () => {
        // await reset();
        // await indexerHelper.reset();
    });

    it("Fill bids and transfer failed", async () => {
        const buyer = alice;
        const buyer2 = nico;
        const seller = bob;

        const testOrderKind = "payment-processor-v2.0.1";
        // const testOrderKind = "payment-processor-v2";

        const price = parseEther("1");
        const boughtTokenId = Math.floor(Math.random() * 100000000);
        const weth = new Common.Helpers.WNative(ethers.provider, chainId);

        const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);
        const fillAmount = 1;
        const orderAmount = 2;

        // Mint weth to buyer
        await weth.deposit(buyer, price.mul(4));
        await weth.deposit(buyer2, price.mul(4));

        // Mint erc721 to seller
        await erc1155.connect(seller).mint(boughtTokenId);
        await erc1155.connect(seller).mint(boughtTokenId);
        await erc1155.connect(seller).mint(boughtTokenId);

        // Store collection
        await indexerHelper.doOrderSaving({
            currency: weth.contract.address,
            // Refresh balance incase the local indexer doesn't have the state
            makers: [buyer.address, buyer2.address],
            contract: erc1155.address,
            kind: "erc1155",
            nfts: [
                {
                    collection: erc1155.address,
                    tokenId: boughtTokenId.toString(),
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
                    quantity: orderAmount,
                    currency: Common.Addresses.WNative[chainId],
                    weiPrice: price.toString(), // 1 USDC
                    token: `${erc1155.address}:${boughtTokenId}`,
                },
            ],
            maker: buyer.address,
        };

        const bidResponse = await indexerHelper.executeBidV5(bidParams);
        const bid1 = await indexerHelper.executeSteps(bidResponse.steps, buyer);
        const orderId1 = bid1.find(c => c.step === 'order-signature').result.results[0].orderId

        const sellParams = {
            items: [
                {
                    token: `${erc1155.address}:${boughtTokenId}`,
                    quantity: fillAmount,
                    orderId: orderId1,
                },
            ],
            taker: seller.address,
        };

        const beforeAmount = await nft.getBalance(seller.address, boughtTokenId);
        const executeResponse = await indexerHelper.executeSellV7(sellParams);
        await indexerHelper.executeSteps(executeResponse.steps, seller);
        const afterAmount = await nft.getBalance(seller.address, boughtTokenId);

        expect(beforeAmount.sub(afterAmount)).to.eq(1);
    });
});
