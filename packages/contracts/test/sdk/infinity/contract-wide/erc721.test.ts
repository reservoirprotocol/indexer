import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish, Contract } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import * as Infinity from "@reservoir0x/sdk/src/infinity";
import * as Common from "@reservoir0x/sdk/src/common";

import { getChainId, reset, setupNFTs, getCurrentTimestamp, bn } from "../../../utils";
import { expect } from "chai";
import { Weth } from "@reservoir0x/sdk/src/common/helpers";

describe("Infinity - Contract Wide ERC721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let weth: Weth;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    weth = new Common.Helpers.WNative(ethers.provider, chainId);

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and take contract wide buy order", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1").toString();

    const tokenId = "1";
    await erc721.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Infinity.Exchange(chainId);

    const builder = new Infinity.Builders.ContractWide(chainId);

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
      currency: Common.Addresses.WNative[chainId],
      numItems: 1,
    });

    await buyOrder.sign(buyer);

    await erc721.connect(seller).setApprovalForAll(Infinity.Addresses.Exchange[chainId], true);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Infinity.Addresses.Exchange[chainId], price);

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

    const protocolFeeBps: BigNumberish = await exchange.contract.connect(seller).protocolFeeBps();
    const fees = bn(price).mul(protocolFeeBps).div(10000);

    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.be.gte(price);
    expect(sellerWethBalanceAfter).to.eq(sellerWethBalanceBefore.add(price).sub(fees));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Fail to build contract wide sell order", async () => {
    const buyer = alice;
    const price = parseEther("1").toString();

    const builder = new Infinity.Builders.ContractWide(chainId);
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
        currency: Common.Addresses.WNative[chainId],
        numItems: 1,
      })
    ).to.throw();
  });
});
