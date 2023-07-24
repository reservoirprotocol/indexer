import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as LooksRareV2 from "@reservoir0x/sdk/src/looks-rare-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("LooksRareV2 - ContractWide Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, LooksRareV2.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, LooksRareV2.Addresses.TransferManager[chainId]);

    const exchange = new LooksRareV2.Exchange(chainId);

    await exchange.grantApprovals(seller, [LooksRareV2.Addresses.Exchange[chainId]]);

    await exchange.grantApprovals(buyer, [LooksRareV2.Addresses.Exchange[chainId]]);

    const builder = new LooksRareV2.Builders.ContractWide(chainId);

    // Build buy order
    const buyOrder = builder.build({
      quoteType: LooksRareV2.Types.QuoteType.Bid,
      collectionType: LooksRareV2.Types.CollectionType.ERC1155,
      signer: buyer.address,
      collection: erc1155.address,
      currency: Common.Addresses.WNative[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      globalNonce: await exchange.getGlobalNonce(ethers.provider, buyer.address, "buy"),
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching(seller.address, {
      tokenId: boughtTokenId,
    });

    await buyOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const ownerBalanceBefore = await nft.getBalance(seller.address, boughtTokenId);

    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBalanceBefore).to.eq(1);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerBalanceAfter = await nft.getBalance(seller.address, boughtTokenId);

    expect(buyerBalanceAfter).to.eq(0);
    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(50).div(10000)));
    expect(ownerBalanceAfter).to.eq(0);
  });
});
