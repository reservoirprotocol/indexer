import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as ZeroexV4 from "@reservoir0x/sdk/src/zeroex-v4";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../../utils";

describe("ZeroEx V4 - ContractWide Erc721", () => {
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
    const price = parseEther("1");
    const boughtTokenId = 1;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, ZeroexV4.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new ZeroexV4.Exchange(chainId);
    const builder = new ZeroexV4.Builders.ContractWide(chainId);

    // Build buy order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: erc721.address,
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching({ tokenId: boughtTokenId });

    await buyOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const ownerBefore = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceBefore).to.eq(price);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceAfter).to.eq(0);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
