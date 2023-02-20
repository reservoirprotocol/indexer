import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish, Contract } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import * as Infinity from "@reservoir0x/sdk/src/infinity";
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

describe("Infinity - Complex ERC721", () => {
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

  it("Build and take one of three sell order", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1").toString();

    const tokenIdOne = "1";
    const tokenIdTwo = "2";
    const tokenIdThree = "3";
    await erc721.connect(seller).mint(tokenIdOne);
    await erc721.connect(seller).mint(tokenIdTwo);
    await erc721.connect(seller).mint(tokenIdThree);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Infinity.Exchange(chainId);

    const builder = new Infinity.Builders.Complex(chainId);

    const currentTime = await getCurrentTimestamp(ethers.provider);

    const buyOrder = builder.build({
      isSellOrder: false,
      signer: buyer.address,
      startPrice: price,
      endPrice: price,
      startTime: currentTime,
      endTime: currentTime + 60,
      nonce: "1",
      maxGasPrice: "1",
      numItems: 1,
      currency: Common.Addresses.Weth[chainId],
      nfts: [
        {
          collection: erc721.address,
          tokens: [
            {
              tokenId: tokenIdOne,
              numTokens: 1,
            },
            {
              tokenId: tokenIdTwo,
              numTokens: 1,
            },
            {
              tokenId: tokenIdThree,
              numTokens: 1,
            },
          ],
        },
      ],
    });

    await buyOrder.sign(buyer);

    await erc721
      .connect(seller)
      .setApprovalForAll(Infinity.Addresses.Exchange[chainId], true);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Infinity.Addresses.Exchange[chainId], price);

    await buyOrder.checkFillability(ethers.provider);
    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const ownerBeforeOne = await nft.getOwner(tokenIdOne);
    const ownerBeforeTwo = await nft.getOwner(tokenIdTwo);
    const ownerBeforeThree = await nft.getOwner(tokenIdThree);

    expect(ownerBeforeOne).to.eq(seller.address);
    expect(ownerBeforeTwo).to.eq(seller.address);
    expect(ownerBeforeThree).to.eq(seller.address);

    await exchange.takeOrders(seller, [
      {
        order: buyOrder,
        tokens: [
          {
            collection: erc721.address,
            tokens: [{ tokenId: tokenIdTwo, numTokens: 1 }],
          },
        ],
      },
    ]);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfterTwo = await nft.getOwner(tokenIdTwo);
    const ownerAfterOne = await nft.getOwner(tokenIdOne);
    const ownerAfterThree = await nft.getOwner(tokenIdThree);

    const protocolFeeBps: BigNumberish = await exchange.contract
      .connect(seller)
      .protocolFeeBps();
    const fees = bn(price).mul(protocolFeeBps).div(10000);

    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.be.gte(price);
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(price).sub(fees)
    );
    expect(ownerAfterTwo).to.eq(buyer.address);
    expect(ownerAfterOne).to.eq(seller.address);
    expect(ownerAfterThree).to.eq(seller.address);
  });
});
