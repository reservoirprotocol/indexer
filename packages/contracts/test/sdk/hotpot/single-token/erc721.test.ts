import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Hotpot from "@reservoir0x/sdk/src/hotpot";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AddressZero } from "@ethersproject/constants";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";
import { OfferTokenType } from '@reservoir0x/sdk/src/hotpot/types';
import { s } from '@reservoir0x/sdk/src/utils';


describe("Hotpot - Single-token ERC721 test", () => {
  const chainId = getChainId();
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    ({ erc721 } = await setupNFTs(deployer));
  });

  it('Create and fulfill sell order', async () => {
    const seller = alice;
    const buyer = bob;
    const tokenId = 0;
    const price = parseEther("1.35");
    const endTime = (await getCurrentTimestamp(ethers.provider)) + 60 * 60 * 24;
    const exchange = new Hotpot.Exchange(chainId);
    const raffleContractAddress = await exchange.raffleContractAddress(ethers.provider);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Hotpot.Addresses.Exchange[chainId]);
    const builder = new Hotpot.Builders.SingleTokenBuilder(chainId);

    // Build order
    const order = builder.build({
      currency: Common.Addresses.Native[chainId],
      offerer: seller.address,
      offerTokenId: s(tokenId),
      collectionType: OfferTokenType.ERC721,
      tokenContract: erc721.address,
      price: price,
      amount: 1,
      endTime: endTime,
      royaltyPercent: 0,
      royaltyRecepient: AddressZero,
    }); 
    await order.sign(seller);  
    
    const matching_order = await order.buildMatching(
      ethers.provider,
      buyer.address
    );
    const trade_amount = await exchange.calculateTradeAmount(
      ethers.provider,
      matching_order
    );
    const raffle_fee = await exchange.calculateRaffleFee(
      ethers.provider,
      matching_order
    );

    await order.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const raffleBalanceBefore = await ethers.provider.getBalance(raffleContractAddress);
    const ownerBefore = await nft.getOwner(tokenId);

    expect(ownerBefore).to.eq(seller.address);
    
    await exchange.fulfillOrder(buyer, matching_order);

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const raffleBalanceAfter = await ethers.provider.getBalance(raffleContractAddress);
    const ownerAfter = await nft.getOwner(tokenId);
    
    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(trade_amount), 
      "Buyer balance mismatch"
    );
    expect(sellerBalanceAfter).to.equal(sellerBalanceBefore.add(price), 
      "Seller balance mismatch"
    );
    expect(ownerAfter).to.equal(buyer.address, "Nft 721 incorrect receiver");
    expect(raffleBalanceAfter).to.equal(raffleBalanceBefore.add(raffle_fee), 
      "Raffle contract balance mismatch"
    );
  });
});