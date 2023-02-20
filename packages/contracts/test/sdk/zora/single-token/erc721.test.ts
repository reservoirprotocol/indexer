import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Zora from "@reservoir0x/sdk/src/zora";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs } from "../../../utils";

describe("Zora - SingleToken Erc721", () => {
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

  it("Fill sell order", async () => {
    const seller = alice;
    const buyer = bob;
    const tokenId = "99";
    const price = parseEther("1");

    // Mint erc721 to the seller.
    await erc721.connect(seller).mint(tokenId);

    const exchange = new Zora.Exchange(chainId);
    const moduleManager = new Zora.ModuleManager(chainId);

    await moduleManager.setApprovalForModule(
      seller,
      Zora.Addresses.Exchange[chainId],
      true
    );

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Zora.Addresses.Erc721TransferHelper[chainId], true);

    expect(await erc721.ownerOf(tokenId), seller.address);

    // Create sell order.
    const order = new Zora.Order(chainId, {
      tokenContract: erc721.address,
      tokenId,
      askPrice: price.toString(),
      askCurrency: ethers.constants.AddressZero,
      sellerFundsRecipient: seller.address,
      findersFeeBps: 0,
    });
    await exchange.createOrder(seller, order);

    const sellerEthBalanceBefore = await seller.getBalance();
    const buyerEthBalanceBefore = await buyer.getBalance();

    // Fill sell order.
    await exchange.fillOrder(buyer, order);

    const sellerEthBalanceAfter = await seller.getBalance();
    const buyerEthBalanceAfter = await buyer.getBalance();

    expect(sellerEthBalanceAfter).to.gt(sellerEthBalanceBefore);
    expect(buyerEthBalanceAfter).to.lt(buyerEthBalanceBefore);
  });
});
