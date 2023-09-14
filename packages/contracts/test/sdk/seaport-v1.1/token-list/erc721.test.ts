import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as SeaportV11 from "@reservoir0x/sdk/src/seaport-v1.1";
import { Builders } from "@reservoir0x/sdk/src/seaport-base";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("SeaportV11 - TokenList ERC721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const feeRecipient = carol;

    const price = parseEther("1");
    const fee = 250;
    const boughtTokenIds = Array.from(Array(100000).keys());
    const soldTokenId = 99999;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange for the buyer
    await weth.approve(buyer, SeaportV11.Addresses.Exchange[chainId]);

    // Approve the exchange for the seller
    await weth.approve(seller, SeaportV11.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV11.Addresses.Exchange[chainId]);

    const exchange = new SeaportV11.Exchange(chainId);
    const builder = new Builders.TokenList(chainId);

    // Build buy order
    const buyOrder = builder.build(
      {
        offerer: buyer.address,
        contract: erc721.address,
        tokenIds: boughtTokenIds,
        tokenKind: "erc721",
        side: "buy",
        price,
        paymentToken: Common.Addresses.WNative[chainId],
        fees: [
          {
            recipient: feeRecipient.address,
            amount: price.mul(fee).div(10000),
          },
        ],
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        counter: await exchange.getCounter(ethers.provider, buyer.address),
      },
      SeaportV11.Order
    );

    buyOrder.checkValidity();

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching sell order
    const matchParams = buyOrder.buildMatching({
      tokenId: soldTokenId,
      tokenIds: boughtTokenIds,
    });

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const feeRecipientBalanceBefore = await weth.getBalance(feeRecipient.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerBalanceBefore).to.eq(0);
    expect(feeRecipientBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const feeRecipientBalanceAfter = await weth.getBalance(feeRecipient.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceAfter).to.eq(0);
    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(fee).div(10000)));
    expect(feeRecipientBalanceAfter).to.eq(price.mul(fee).div(10000));
    expect(ownerAfter).to.eq(buyer.address);
  });
});
