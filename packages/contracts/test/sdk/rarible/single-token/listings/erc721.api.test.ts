import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Rarible from "@reservoir0x/sdk/src/rarible";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs } from "../../../../utils";
import { BigNumber, constants } from "ethers";
import { v2ApiOrder } from "./orders";

describe("Rarible - SingleToken Listings Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, charlie, dan] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("API Rarible V2 Order data - 1 payout and 0 origin fees - Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "1000";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = new Rarible.Order(chainId, v2ApiOrder as any);

    // Sign the order
    // await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    // await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const danBalanceBefore = await ethers.provider.getBalance(dan.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const danBalanceAfter = await ethers.provider.getBalance(dan.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );

    // let priceAfterFees = price;
    // priceAfterFees = priceAfterFees.sub(
    //   priceAfterFees
    //     .mul(BigNumber.from('1000'))
    //     .div(10000)
    // );

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });
});
