/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import * as indexerHelper from "../../indexer-helper";
import { getChainId, setupNFTs } from "../../utils";

import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import { expect } from "chai";


describe("OrderBookFee - Test", () => {
    const chainId = getChainId();

    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let nico: SignerWithAddress;

    let erc721: Contract;

    const ORDERBOOK_FEE_RECIPIENT = '0xeF37d6e83cE06503EC58b201ABa60232bFa0fd69';
    const DEFAULT_ORDERBOOK_FEE_BPS = 30;

    beforeEach(async () => {
        // Reset Indexer
        await indexerHelper.reset();

        [deployer, alice, bob, nico] = await ethers.getSigners();
        ({ erc721 } = await setupNFTs(deployer));
    });

    afterEach(async () => {
        // await reset();
        // await indexerHelper.reset();
    });

    it("Payment Processor v2 - bid", async () => {
        const buyer = alice;
        const buyer2 = nico;
        const seller = bob;

        const testOrderKind = "payment-processor-v2";

        const price = parseEther("1");
        const boughtTokenId = Math.floor(Math.random() * 100000000);
        const weth = new Common.Helpers.WNative(ethers.provider, chainId);

        const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
        const fillAmount = 1;
        const orderAmount = 1;

        // Mint weth to buyer
        await weth.deposit(buyer, price.mul(4));
        await weth.deposit(buyer2, price.mul(4));

        // Mint erc721 to seller
        await erc721.connect(seller).mint(boughtTokenId);

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
                    token: `${erc721.address}:${boughtTokenId}`,
                },
            ],
            maker: buyer.address,
        };

        const bidResponse = await indexerHelper.executeBidV5(bidParams);
        const orderEIP712 = bidResponse.steps.find((c: any) => c.id === "order-signature").items[0].data.sign;

        const bid1 = await indexerHelper.executeSteps(bidResponse.steps, buyer);
        const orderId1 = bid1.find(c => c.step === 'order-signature').result.results[0].orderId

        const sellParams = {
            items: [
                {
                    token: `${erc721.address}:${boughtTokenId}`,
                    quantity: fillAmount,
                    orderId: orderId1,
                },
            ],
            taker: seller.address,
        };

        const orderbookFeeBefore = await weth.getBalance(ORDERBOOK_FEE_RECIPIENT);

        const executeResponse = await indexerHelper.executeSellV7(sellParams);
        await indexerHelper.executeSteps(executeResponse.steps, seller);
        const orderbookFeeAfter = await weth.getBalance(ORDERBOOK_FEE_RECIPIENT);
        const orderbookFeeRecived = orderbookFeeAfter.sub(orderbookFeeBefore);

        expect(orderEIP712.value.marketplace).to.eq(ORDERBOOK_FEE_RECIPIENT.toLowerCase())
        expect(orderEIP712.value.marketplaceFeeNumerator).to.eq(String(DEFAULT_ORDERBOOK_FEE_BPS))
        expect(orderbookFeeRecived).to.eq(price.mul(DEFAULT_ORDERBOOK_FEE_BPS).div(10000));
    });

    it("Payment Processor v2 - bid - with fee", async () => {
        const buyer = alice;
        const buyer2 = nico;
        const seller = bob;

        const testOrderKind = "payment-processor-v2";

        const price = parseEther("1");
        const boughtTokenId = Math.floor(Math.random() * 100000000);
        const weth = new Common.Helpers.WNative(ethers.provider, chainId);

        const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
        const fillAmount = 1;
        const orderAmount = 1;

        // Mint weth to buyer
        await weth.deposit(buyer, price.mul(4));
        await weth.deposit(buyer2, price.mul(4));

        // Mint erc721 to seller
        await erc721.connect(seller).mint(boughtTokenId);

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
                    token: `${erc721.address}:${boughtTokenId}`,
                    fees: [
                        `${alice.address}:50`
                    ]

                },
            ],
            maker: buyer.address,
        };

        const bidResponse = await indexerHelper.executeBidV5(bidParams);
        const orderEIP712 = bidResponse.steps.find((c: any) => c.id === "order-signature").items[0].data.sign;

        const bid1 = await indexerHelper.executeSteps(bidResponse.steps, buyer);
        const orderId1 = bid1.find(c => c.step === 'order-signature').result.results[0].orderId

        const sellParams = {
            items: [
                {
                    token: `${erc721.address}:${boughtTokenId}`,
                    quantity: fillAmount,
                    orderId: orderId1,
                },
            ],
            taker: seller.address,
        };

        const orderbookFeeBefore = await weth.getBalance(ORDERBOOK_FEE_RECIPIENT);

        const executeResponse = await indexerHelper.executeSellV7(sellParams);
        await indexerHelper.executeSteps(executeResponse.steps, seller);
        const orderbookFeeAfter = await weth.getBalance(ORDERBOOK_FEE_RECIPIENT);
        const orderbookFeeRecived = orderbookFeeAfter.sub(orderbookFeeBefore);

        expect(orderEIP712.value.marketplace).not.eq(ORDERBOOK_FEE_RECIPIENT.toLowerCase())
        expect(orderEIP712.value.marketplaceFeeNumerator).not.eq(String(DEFAULT_ORDERBOOK_FEE_BPS))
        expect(orderbookFeeRecived).to.eq(0);
    });

    it("Seaport - bid - with fee", async () => {
        const buyer = alice;
        const buyer2 = nico;
        const seller = bob;

        const testOrderKind = "seaport-v1.5";

        const price = parseEther("1");
        const boughtTokenId = Math.floor(Math.random() * 100000000);
        const weth = new Common.Helpers.WNative(ethers.provider, chainId);

        const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
        const fillAmount = 1;
        const orderAmount = 1;

        // Mint weth to buyer
        await weth.deposit(buyer, price.mul(4));
        await weth.deposit(buyer2, price.mul(4));

        // Mint erc721 to seller
        await erc721.connect(seller).mint(boughtTokenId);

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
                    token: `${erc721.address}:${boughtTokenId}`,
                    fees: [
                        `${alice.address}:50`
                    ]

                },
            ],
            maker: buyer.address,
        };

        const bidResponse = await indexerHelper.executeBidV5(bidParams);
        const orderEIP712 = bidResponse.steps.find((c: any) => c.id === "order-signature").items[0].data.sign;
        const feeItem = orderEIP712.value.consideration.find((c: any) => c.recipient === ORDERBOOK_FEE_RECIPIENT.toLowerCase());
        expect(feeItem.startAmount).to.eq(price.mul(DEFAULT_ORDERBOOK_FEE_BPS).div(10000));
    });

    it("Seaport - bid - with fee - other orderbook", async () => {
        const buyer = alice;
        const buyer2 = nico;
        const seller = bob;

        const testOrderKind = "seaport-v1.5";

        const price = parseEther("1");
        const boughtTokenId = Math.floor(Math.random() * 100000000);
        const weth = new Common.Helpers.WNative(ethers.provider, chainId);

        const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
        const fillAmount = 1;
        const orderAmount = 1;

        // Mint weth to buyer
        await weth.deposit(buyer, price.mul(4));
        await weth.deposit(buyer2, price.mul(4));

        // Mint erc721 to seller
        await erc721.connect(seller).mint(boughtTokenId);

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

        const bidParams = {
            params: [
                {
                    orderKind: testOrderKind,
                    // options: {
                    //     [testOrderKind]: {
                    //         useOffChainCancellation: true,
                    //     },
                    // },
                    orderbook: "opensea",
                    automatedRoyalties: true,
                    excludeFlaggedTokens: false,
                    quantity: orderAmount,
                    currency: Common.Addresses.WNative[chainId],
                    weiPrice: price.toString(), // 1 USDC
                    token: `${erc721.address}:${boughtTokenId}`,
                    fees: [
                        `${alice.address}:50`
                    ]

                },
            ],
            maker: buyer.address,
        };

        const bidResponse = await indexerHelper.executeBidV5(bidParams);
        const orderEIP712 = bidResponse.steps.find((c: any) => c.id === "order-signature").items[0].data.sign;
        const feeItem = orderEIP712.value.consideration.find((c: any) => c.recipient === ORDERBOOK_FEE_RECIPIENT.toLowerCase());
        expect(feeItem).to.eq(undefined);
    });
});
