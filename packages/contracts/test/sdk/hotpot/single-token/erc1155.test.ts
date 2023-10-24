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


describe("Hotpot - Single-token ERC1155 test", () => {
  const chainId = getChainId();
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let erc1155: Contract;
  const operator_pk = process.env.OPERATOR_PK;

  if (!operator_pk) {
    throw new Error("Operator private key is not set up");
  }

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    ({ erc1155 } = await setupNFTs(deployer));
  });

  it('Create and fulfill sell order', async () => {
    const seller = alice;
    const buyer = bob;
    const tokenId = 0;
    const price = parseEther("1.1");
    const buyer_pending_amount = 0;
    const offerer_pending_amount = parseEther("0.05");
    const endTime = (await getCurrentTimestamp(ethers.provider)) + 60 * 60 * 24;
    const exchange = new Hotpot.Exchange(chainId);
    const raffleContractAddress = await exchange.raffleContractAddress();

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(tokenId);
    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Hotpot.Addresses.Exchange[chainId]);
    const builder = new Hotpot.Builders.SingleTokenBuilder(chainId);

    // Build order
    const order = builder.build({
      offerer: seller.address,
      offerTokenId: s(tokenId),
      collectionType: OfferTokenType.ERC1155,
      tokenContract: erc1155.address,
      price: price,
      amount: 1,
      endTime: endTime,
      royaltyPercent: 0,
      royaltyRecepient: AddressZero,
    }); 
    await order.sign(seller);  
    
    const matching_order = await order.buildMatching(
      buyer.address,
      buyer_pending_amount,
      offerer_pending_amount
    );
    const trade_amount = await exchange.calculateTradeAmount(matching_order);
    const raffle_fee = await exchange.calculateRaffleFee(matching_order);

    await order.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const raffleBalanceBefore = await ethers.provider.getBalance(raffleContractAddress);
    const ownerBalanceBefore = await nft.getBalance(seller.address, tokenId);

    expect(ownerBalanceBefore).to.eq(1);
    
    await exchange.fulfillOrder(buyer, matching_order);

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerBalanceAfter = await nft.getBalance(seller.address, tokenId);
    const raffleBalanceAfter = await ethers.provider.getBalance(raffleContractAddress);
    
    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(trade_amount), 
      "Buyer balance mismatch"
    );
    expect(sellerBalanceAfter).to.equal(sellerBalanceBefore.add(price), 
      "Seller balance mismatch"
    );
    expect(ownerBalanceAfter).to.eq(0, "Nft erc1155 balance mismatch");
    expect(raffleBalanceAfter).to.equal(raffleBalanceBefore.add(raffle_fee), 
      "Raffle contract balance mismatch"
    );
  });
});