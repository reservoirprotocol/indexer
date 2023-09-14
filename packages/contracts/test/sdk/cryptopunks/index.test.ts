import { BigNumberish } from "@ethersproject/bignumber";
import { parseEther } from "@ethersproject/units";
import * as Cryptopunks from "@reservoir0x/sdk/src/cryptopunks";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { getChainId, reset } from "../../utils";

describe("CryptoPunks", () => {
  const chainId = getChainId();

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let punks: Cryptopunks.Exchange;

  beforeEach(async () => {
    [alice, bob] = await ethers.getSigners();

    punks = new Cryptopunks.Exchange(chainId);
  });

  afterEach(reset);

  const sendPunk = async (tokenId: BigNumberish, to: string) => {
    const wrappedPunksAddress = "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6";
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [wrappedPunksAddress],
    });
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [wrappedPunksAddress, "0x1000000000000000000"],
    });

    const wrappedPunks = await ethers.getSigner(wrappedPunksAddress);
    await punks.contract.connect(wrappedPunks).transferPunk(to, tokenId);
  };

  it("Fill listing", async () => {
    const seller = alice;
    const buyer = bob;
    const tokenId = 7326;
    const price = parseEther("1");

    await sendPunk(tokenId, seller.address);

    const listing = new Cryptopunks.Order(chainId, {
      maker: seller.address,
      side: "sell",
      tokenId,
      price,
    });
    await punks.createListing(seller, listing);

    await punks.fillListing(buyer, listing, { source: "reservoir.market" });

    expect(
      await punks.contract.connect(ethers.provider).punkIndexToAddress(tokenId)
    ).to.eq(buyer.address);
    expect(
      await punks.contract
        .connect(ethers.provider)
        .pendingWithdrawals(seller.address)
    ).to.eq(price);
  });

  it("Fill bid", async () => {
    const seller = alice;
    const buyer = bob;
    const tokenId = 7326;
    const price = parseEther("1");

    await sendPunk(tokenId, seller.address);

    const bid = new Cryptopunks.Order(chainId, {
      maker: buyer.address,
      side: "buy",
      tokenId,
      price,
    });
    await punks.createBid(buyer, bid);

    await punks.fillBid(seller, bid, { source: "reservoir.market" });

    expect(
      await punks.contract.connect(ethers.provider).punkIndexToAddress(tokenId)
    ).to.eq(buyer.address);
    expect(
      await punks.contract
        .connect(ethers.provider)
        .pendingWithdrawals(seller.address)
    ).to.eq(price);
  });
});
