import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish, Contract } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import * as Flow from "@reservoir0x/sdk/src/flow";
import * as Common from "@reservoir0x/sdk/src/common";

import {
  getChainId,
  reset,
  setupNFTs,
  getCurrentTimestamp,
  bn,
} from "../../../utils";
import { expect } from "chai";
import { Weth } from "@reservoir0x/sdk/src/common/helpers";

describe("Flow - Contract Wide ERC721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let weth: Weth;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    weth = new Common.Helpers.Weth(ethers.provider, chainId);

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and take contract wide buy order - Complication V1", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1").toString();

    const tokenId = "1";
    await erc721.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Flow.Exchange(chainId);

    const builder = new Flow.Builders.ContractWide(chainId);

    const currentTime = await getCurrentTimestamp(ethers.provider);

    const buyOrder = builder.build({
      isSellOrder: false,
      collection: erc721.address,
      signer: buyer.address,
      startPrice: price,
      endPrice: price,
      startTime: currentTime,
      endTime: currentTime + 60,
      nonce: "1",
      maxGasPrice: "1",
      currency: Common.Addresses.Weth[chainId],
      numItems: 1,
      complication: Flow.Addresses.Complication[chainId],
    });

    await buyOrder.sign(buyer);

    await erc721
      .connect(seller)
      .setApprovalForAll(Flow.Addresses.Exchange[chainId], true);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Flow.Addresses.Exchange[chainId], price);

    await buyOrder.checkFillability(ethers.provider);
    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(tokenId);

    expect(ownerBefore).to.eq(seller.address);

    await exchange.takeOrders(seller, [
      {
        order: buyOrder,
        tokens: [
          {
            collection: erc721.address,
            tokens: [{ tokenId: tokenId, numTokens: 1 }],
          },
        ],
      },
    ]);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(tokenId);

    const protocolFeeBps: BigNumberish = await exchange.contract
      .connect(seller)
      .protocolFeeBps();
    const fees = bn(price).mul(protocolFeeBps).div(10000);

    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.be.gte(price);
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(price).sub(fees)
    );
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and take contract wide buy order - Complication V2", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1").toString();

    const tokenId = "1";
    await erc721.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Flow.Exchange(chainId);

    const builder = new Flow.Builders.ContractWide(chainId);

    const currentTime = await getCurrentTimestamp(ethers.provider);

    const buyOrder = builder.build({
      isSellOrder: false,
      collection: erc721.address,
      signer: buyer.address,
      startPrice: price,
      endPrice: price,
      startTime: currentTime,
      endTime: currentTime + 60,
      nonce: "1",
      maxGasPrice: "1",
      currency: Common.Addresses.Weth[chainId],
      numItems: 1,
      complication: Flow.Addresses.ComplicationV2[chainId],
    });

    await buyOrder.sign(buyer);

    await erc721
      .connect(seller)
      .setApprovalForAll(Flow.Addresses.Exchange[chainId], true);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Flow.Addresses.Exchange[chainId], price);

    await buyOrder.checkFillability(ethers.provider);
    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(tokenId);

    expect(ownerBefore).to.eq(seller.address);

    await exchange.takeOrders(seller, [
      {
        order: buyOrder,
        tokens: [
          {
            collection: erc721.address,
            tokens: [{ tokenId: tokenId, numTokens: 1 }],
          },
        ],
      },
    ]);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(tokenId);

    const protocolFeeBps: BigNumberish = await exchange.contract
      .connect(seller)
      .protocolFeeBps();
    const fees = bn(price).mul(protocolFeeBps).div(10000);

    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.be.gte(price);
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(price).sub(fees)
    );
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Fail to build contract wide sell order", async () => {
    const buyer = alice;
    const price = parseEther("1").toString();

    const builder = new Flow.Builders.ContractWide(chainId);
    const currentTime = await getCurrentTimestamp(ethers.provider);

    /**
     * Contract sell orders are not supported
     */
    expect(() =>
      builder.build({
        isSellOrder: true,
        collection: erc721.address,
        signer: buyer.address,
        startPrice: price,
        endPrice: price,
        startTime: currentTime,
        endTime: currentTime + 60,
        nonce: "1",
        maxGasPrice: "1",
        currency: Common.Addresses.Weth[chainId],
        numItems: 1,
      })
    ).to.throw();
  });
});
