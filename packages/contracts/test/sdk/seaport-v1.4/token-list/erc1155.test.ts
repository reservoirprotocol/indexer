import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as SeaportV14 from "@reservoir0x/sdk/src/seaport-v1.4";
import { Builders } from "@reservoir0x/sdk/src/seaport-base";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("SeaportV14 - TokenList ERC1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, dan] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill buy order with partial filling", async () => {
    const buyer = alice;
    const seller1 = bob;
    const seller2 = dan;
    const feeRecipient = carol;

    const amount = 2;
    const price = parseEther("1").mul(amount);
    const fee = 250;
    const boughtTokenIds = Array.from(Array(10000).keys());
    const soldTokenId1 = 99;
    const soldTokenId2 = 999;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange for the buyer
    await weth.approve(buyer, SeaportV14.Addresses.Exchange[chainId]);

    // Approve the exchange for the sellers
    await weth.approve(seller1, SeaportV14.Addresses.Exchange[chainId]);
    await weth.approve(seller2, SeaportV14.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller2
    await erc1155.connect(seller1).mint(soldTokenId1);
    await erc1155.connect(seller2).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller1, SeaportV14.Addresses.Exchange[chainId]);
    await nft.approve(seller2, SeaportV14.Addresses.Exchange[chainId]);

    const exchange = new SeaportV14.Exchange(chainId);
    const builder = new Builders.TokenList(chainId);

    // Build buy order
    const buyOrder = builder.build(
      {
        offerer: buyer.address,
        contract: erc1155.address,
        amount,
        tokenIds: boughtTokenIds,
        tokenKind: "erc1155",
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
      SeaportV14.Order
    );
    await buyOrder.sign(buyer);

    buyOrder.checkValidity();
    await buyOrder.checkFillability(ethers.provider);

    // First fill
    {
      const matchParams = buyOrder.buildMatching({
        tokenId: soldTokenId1,
        tokenIds: boughtTokenIds,
      });

      const buyerBalanceBefore = await weth.getBalance(buyer.address);
      const sellerBalanceBefore = await weth.getBalance(seller1.address);
      const feeRecipientBalanceBefore = await weth.getBalance(feeRecipient.address);

      // Match orders
      await exchange.fillOrder(seller1, buyOrder, matchParams);

      const buyerBalanceAfter = await weth.getBalance(buyer.address);
      const sellerBalanceAfter = await weth.getBalance(seller1.address);
      const feeRecipientBalanceAfter = await weth.getBalance(feeRecipient.address);

      expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.eq(price.sub(price.div(amount)));
      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.eq(
        price.div(amount).sub(price.div(amount).mul(fee).div(10000))
      );
      expect(feeRecipientBalanceAfter.sub(feeRecipientBalanceBefore)).to.eq(
        price.div(amount).mul(fee).div(10000)
      );
    }

    // Second fill
    {
      const matchParams = buyOrder.buildMatching({
        tokenId: soldTokenId2,
        tokenIds: boughtTokenIds,
      });

      const buyerBalanceBefore = await weth.getBalance(buyer.address);
      const sellerBalanceBefore = await weth.getBalance(seller2.address);
      const feeRecipientBalanceBefore = await weth.getBalance(feeRecipient.address);

      // Match orders
      await exchange.fillOrder(seller2, buyOrder, matchParams);

      const buyerBalanceAfter = await weth.getBalance(buyer.address);
      const sellerBalanceAfter = await weth.getBalance(seller2.address);
      const feeRecipientBalanceAfter = await weth.getBalance(feeRecipient.address);

      expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.eq(price.sub(price.div(amount)));
      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.eq(
        price.div(amount).sub(price.div(amount).mul(fee).div(10000))
      );
      expect(feeRecipientBalanceAfter.sub(feeRecipientBalanceBefore)).to.eq(
        price.div(amount).mul(fee).div(10000)
      );
    }
  });
});
