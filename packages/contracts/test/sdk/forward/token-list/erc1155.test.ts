import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Forward from "@reservoir0x/sdk/src/forward";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../../utils";

describe("Forward - TokenList Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc1155: Contract;
  let weth: Common.Helpers.Weth;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
    weth = new Common.Helpers.Weth(ethers.provider, chainId);
  });

  afterEach(reset);

  it("Build and fill bid", async () => {
    const buyer = alice;
    const seller = bob;
    const unitPrice = parseEther("1");
    const amount = "5";
    const fillAmount = "3";
    const boughtTokenId = 999;

    const exchange = new Forward.Exchange(chainId);

    // Create vault
    await exchange.createVault(buyer);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(boughtTokenId, fillAmount);
    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);
    await nft.approve(seller, Forward.Addresses.Exchange[chainId]);

    // Mint weth to buyer
    await weth.deposit(buyer, unitPrice.mul(amount));
    await weth.approve(buyer, Forward.Addresses.Exchange[chainId]);

    const builder = new Forward.Builders.TokenList(chainId);

    // Build bid
    const tokenIds = [0, 1, 2, 3, boughtTokenId, 7655];
    const bid = builder.build({
      tokenKind: "erc1155",
      maker: buyer.address,
      contract: erc1155.address,
      unitPrice,
      tokenIds,
      amount,
      counter: 0,
      expiration: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await bid.sign(buyer);

    // Check the fillability
    await bid.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = bid.buildMatching({
      amount: fillAmount,
      tokenId: boughtTokenId,
      tokenIds,
    });

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await nft.getBalance(
      seller.address,
      boughtTokenId
    );

    expect(sellerBalanceBefore).to.eq(fillAmount);

    // Match orders
    await exchange.fillOrder(seller, bid, matchParams, {
      source: "reservoir.market",
    });

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await nft.getBalance(
      seller.address,
      boughtTokenId
    );
    const vaultBalanceAfter = await nft.getBalance(
      (
        await exchange.contract.connect(ethers.provider).vaults(buyer.address)
      ).toLowerCase(),
      boughtTokenId
    );

    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.be.eq(
      unitPrice.mul(fillAmount)
    );
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(unitPrice.mul(fillAmount))
    );

    expect(sellerBalanceAfter).to.eq(0);
    expect(vaultBalanceAfter).to.eq(fillAmount);
  });
});
