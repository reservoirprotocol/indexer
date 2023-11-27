import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessorV2 from "@reservoir0x/sdk/src/payment-processor-v2";
import { Builders } from "@reservoir0x/sdk/src/payment-processor-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("PaymentProcessorV2 - TokenList Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const boughtTokenIds = Array.from(Array(100000).keys());
    const soldTokenId = 99999;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange for the buyer
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Approve the exchange for the seller
    await weth.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.TokenList(chainId);
    const buyOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: AddressZero,
      beneficiary: buyer.address,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
      tokenIds: boughtTokenIds,
    });

    await buyOrder.sign(buyer);
    buyOrder.checkSignature();

    await buyOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      tokenId: soldTokenId,
      tokenIds: boughtTokenIds,
      taker: seller.address,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceAfter).to.eq(0);
    expect(sellerBalanceAfter).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
