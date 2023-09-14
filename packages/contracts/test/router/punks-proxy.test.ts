import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { getChainId, getCurrentTimestamp, reset } from "../utils";

describe("PunksProxy", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let punks: Contract;
  let punksProxy: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    punks = new Contract(
      "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb",
      new Interface(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../../artifacts/contracts/interfaces/ICryptoPunksMarket.sol/ICryptoPunksMarket.json").abi
      ),
      ethers.provider
    );
    punksProxy = await ethers
      .getContractFactory("PunksProxy", deployer)
      .then((factory) => factory.deploy());
  });

  afterEach(reset);

  const sendPunk = async (tokenId: number, to: string) => {
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
    await punks.connect(wrappedPunks).transferPunk(to, tokenId);
  };

  it("Fill listing", async () => {
    // Transfer punk to Alice

    const tokenId = 7171;
    const price = parseEther("100");

    await sendPunk(tokenId, alice.address);

    // Build listing

    await punksProxy
      .connect(alice)
      .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

    const exchange = new Sdk.SeaportV11.Exchange(chainId);
    const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
    const order = builder.build(
      {
        side: "sell",
        tokenKind: "erc721",
        offerer: alice.address,
        contract: punksProxy.address,
        tokenId,
        paymentToken: Sdk.Common.Addresses.Native[chainId],
        price,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      Sdk.SeaportV11.Order
    );
    await order.sign(alice);

    // Checks

    // Filling will fail if the punks approval is not given
    await expect(exchange.fillOrder(bob, order, order.buildMatching())).to.be.reverted;

    await punks.connect(alice).offerPunkForSaleToAddress(tokenId, 0, punksProxy.address);

    // Fill listing
    await exchange.fillOrder(bob, order, order.buildMatching());

    // Bob now owns the punk
    expect(await punks.punkIndexToAddress(tokenId)).to.eq(bob.address);
  });

  it("Fill offer", async () => {
    // Transfer punk to Alice

    const tokenId = 7171;
    const price = parseEther("100");

    await sendPunk(tokenId, alice.address);

    // Build offer

    await punksProxy
      .connect(alice)
      .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

    const weth = new Sdk.Common.Helpers.WNative(ethers.provider, chainId);
    await weth.deposit(bob, price);
    await weth.approve(bob, Sdk.SeaportV11.Addresses.Exchange[chainId]);

    const exchange = new Sdk.SeaportV11.Exchange(chainId);
    const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
    const order = builder.build(
      {
        side: "buy",
        tokenKind: "erc721",
        offerer: bob.address,
        contract: punksProxy.address,
        tokenId,
        paymentToken: Sdk.Common.Addresses.WNative[chainId],
        price,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      Sdk.SeaportV11.Order
    );
    await order.sign(bob);

    // Checks

    // Filling will fail if the punks approval is not given
    await expect(exchange.fillOrder(alice, order, order.buildMatching())).to.be.reverted;

    await punks.connect(alice).offerPunkForSaleToAddress(tokenId, 0, punksProxy.address);

    // Fill offer
    await exchange.fillOrder(alice, order, order.buildMatching());

    // Bob now owns the punk
    expect(await punks.punkIndexToAddress(tokenId)).to.eq(bob.address);
  });
});
