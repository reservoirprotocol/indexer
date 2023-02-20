import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as Common from "@reservoir0x/sdk/src/common";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";

import * as Infinity from "@reservoir0x/sdk/src/infinity";

import {
  getChainId,
  setupNFTs,
  reset,
  getCurrentTimestamp,
  bn,
} from "../../../utils";
import { BigNumberish } from "ethers";

describe("Infinity - Bulk Single Token ERC721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and take sell orders", async () => {
    const buyer = alice;
    const sellerOne = bob;
    const sellerTwo = eve;

    const price = parseEther("1").toString();

    const tokenIdOne = "1";
    const tokenIdTwo = "2";

    await erc721.connect(sellerOne).mint(tokenIdOne);
    await erc721.connect(sellerTwo).mint(tokenIdTwo);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    await nft.approve(sellerOne, Infinity.Addresses.Exchange[chainId]);
    await nft.approve(sellerTwo, Infinity.Addresses.Exchange[chainId]);

    const exchange = new Infinity.Exchange(chainId);

    const builder = new Infinity.Builders.SingleToken(chainId);

    const sellOrderOne = builder.build({
      isSellOrder: true,
      collection: erc721.address,
      signer: sellerOne.address,
      startPrice: price,
      endPrice: price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: "1",
      maxGasPrice: "100000000000",
      currency: Common.Addresses.Eth[chainId],
      tokenId: tokenIdOne,
      numTokens: 1
    });

    const sellOrderTwo = builder.build({
      isSellOrder: true,
      collection: erc721.address,
      signer: sellerTwo.address,
      startPrice: price,
      endPrice: price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: "1",
      maxGasPrice: "100000000000",
      currency: Common.Addresses.Eth[chainId],
      tokenId: tokenIdTwo,
      numTokens: 1
    });

    await sellOrderOne.sign(sellerOne);
    await sellOrderTwo.sign(sellerTwo);
    await sellOrderOne.checkFillability(ethers.provider);
    await sellOrderTwo.checkFillability(ethers.provider);

    const buyerEthBalanceBefore = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerOneEthBalanceBefore = await ethers.provider.getBalance(
      sellerOne.address
    );
    const sellerTwoEthBalanceBefore = await ethers.provider.getBalance(
      sellerTwo.address
    );

    const nftOneOwnerBefore = await nft.getOwner(tokenIdOne);
    const nftTwoOwnerBefore = await nft.getOwner(tokenIdTwo)
    expect(nftOneOwnerBefore).to.eq(sellerOne.address);
    expect(nftTwoOwnerBefore).to.eq(sellerTwo.address);

    await exchange.takeMultipleOneOrders(buyer, [sellOrderOne, sellOrderTwo]);

    const buyerEthBalanceAfter = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerOneEthBalanceAfter = await ethers.provider.getBalance(
      sellerOne.address
    );
    const sellerTwoEthBalanceAfter = await ethers.provider.getBalance(
      sellerTwo.address
    );
    const nftOneOwnerAfter = await nft.getOwner(tokenIdOne);
    const nftTwoOwnerAfter = await nft.getOwner(tokenIdTwo);

    const protocolFeeBps: BigNumberish = await exchange.contract.connect(sellerOne).protocolFeeBps();
    const fees = bn(price).mul(protocolFeeBps).div(10000);

    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gte(bn(price).mul(2));
    expect(sellerOneEthBalanceAfter).to.eq(sellerOneEthBalanceBefore.add(price).sub(fees));
    expect(sellerTwoEthBalanceAfter).to.eq(sellerTwoEthBalanceBefore.add(price).sub(fees));
    expect(nftOneOwnerAfter).to.eq(buyer.address);
    expect(nftTwoOwnerAfter).to.eq(buyer.address);
  });

  it("Build and take offer orders", async () => {
    const buyerOne = alice;
    const buyerTwo = eve;
    const seller = bob;


    const price = parseEther("1").toString();

    const tokenIdOne = "1";
    const tokenIdTwo = "2";

    await erc721.connect(seller).mint(tokenIdOne);
    await erc721.connect(seller).mint(tokenIdTwo);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    await nft.approve(seller, Infinity.Addresses.Exchange[chainId]);

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyerOne, price);
    await weth.deposit(buyerTwo, price);
    // Approve the exchange contract for the buyer
    await weth.approve(buyerOne, Infinity.Addresses.Exchange[chainId]);
    await weth.approve(buyerTwo, Infinity.Addresses.Exchange[chainId]);

    const exchange = new Infinity.Exchange(chainId);

    const builder = new Infinity.Builders.SingleToken(chainId);

    const offerOrderOne = builder.build({
      isSellOrder: false,
      collection: erc721.address,
      signer: buyerOne.address,
      startPrice: price,
      endPrice: price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: "1",
      maxGasPrice: "100000000000",
      currency: Common.Addresses.Weth[chainId],
      tokenId: tokenIdOne,
      numTokens: 1
    });

    const offerOrderTwo = builder.build({
      isSellOrder: false,
      collection: erc721.address,
      signer: buyerTwo.address,
      startPrice: price,
      endPrice: price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: "1",
      maxGasPrice: "100000000000",
      currency: Common.Addresses.Weth[chainId],
      tokenId: tokenIdTwo,
      numTokens: 1
    });

    await offerOrderOne.sign(buyerOne);
    await offerOrderTwo.sign(buyerTwo);
    await offerOrderOne.checkFillability(ethers.provider);
    await offerOrderTwo.checkFillability(ethers.provider);

    const buyerOneWethBalanceBefore = await weth.getBalance(
      buyerOne.address
    );
    const buyerTwoWethBalanceBefore = await weth.getBalance(
      buyerTwo.address
    );
    const sellerWethBalanceBefore = await weth.getBalance(
      seller.address
    );

    const nftOneOwnerBefore = await nft.getOwner(tokenIdOne);
    const nftTwoOwnerBefore = await nft.getOwner(tokenIdTwo);
    expect(nftOneOwnerBefore).to.eq(seller.address);
    expect(nftTwoOwnerBefore).to.eq(seller.address);

    await exchange.takeMultipleOneOrders(seller, [offerOrderOne, offerOrderTwo]);

    const buyerOneWethBalanceAfter = await weth.getBalance(
      buyerOne.address
    );
    const buyerTwoWethBalanceAfter = await weth.getBalance(
      buyerTwo.address
    );
    const sellerWethBalanceAfter = await weth.getBalance(
      seller.address
    );
    const nftOneOwnerAfter = await nft.getOwner(tokenIdOne);
    const nftTwoOwnerAfter = await nft.getOwner(tokenIdTwo);

    const protocolFeeBps: BigNumberish = await exchange.contract.connect(seller).protocolFeeBps();
    const fees = bn(price).mul(protocolFeeBps).div(10000);

    expect(buyerOneWethBalanceBefore.sub(buyerOneWethBalanceAfter)).to.be.gte(price);
    expect(buyerTwoWethBalanceBefore.sub(buyerTwoWethBalanceAfter)).to.be.gte(price);
    expect(sellerWethBalanceAfter).to.eq(sellerWethBalanceBefore.add(price).sub(fees).mul(2));
    expect(nftOneOwnerAfter).to.eq(buyerOne.address);
    expect(nftTwoOwnerAfter).to.eq(buyerTwo.address);
  })
});
