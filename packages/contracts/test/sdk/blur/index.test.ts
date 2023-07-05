import { Interface } from "@ethersproject/abi";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset } from "../../utils";

import BlurAbi from "@reservoir0x/sdk/src/blur/abis/Exchange.json";

describe("Blur fees", () => {
  const chainId = getChainId();

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let blurTransferHelper: Contract;

  beforeEach(async () => {
    [alice, bob] = await ethers.getSigners();

    blurTransferHelper = await ethers
      .getContractFactory("BlurTransferHelper")
      .then((factory) => factory.deploy());
  });

  afterEach(reset);

  it("Charge ETH fees", async () => {
    const fee = parseEther("0.001").toString();
    const sellOrder = new Sdk.Blur.Order(chainId, {
      trader: alice.address,
      side: Sdk.Blur.Types.TradeDirection.SELL,
      matchingPolicy: Sdk.Blur.Addresses.StandardPolicyERC721[chainId],
      collection: blurTransferHelper.address,
      tokenId: "0",
      amount: "1",
      paymentToken: AddressZero,
      price: fee,
      nonce: "0",
      listingTime: String((await getCurrentTimestamp(ethers.provider)) - 60),
      expirationTime: String((await getCurrentTimestamp(ethers.provider)) + 60),
      fees: [
        {
          rate: 10000,
          recipient: bob.address,
        },
      ],
      salt: "0",
      extraParams: "0x",
      extraSignature: "0x",
      signatureVersion: Sdk.Blur.Types.SignatureVersion.SINGLE,
    });
    const buyOrder = new Sdk.Blur.Order(chainId, {
      trader: alice.address,
      side: Sdk.Blur.Types.TradeDirection.BUY,
      matchingPolicy: Sdk.Blur.Addresses.StandardPolicyERC721[chainId],
      collection: blurTransferHelper.address,
      tokenId: "0",
      amount: "1",
      paymentToken: AddressZero,
      price: fee,
      nonce: "0",
      listingTime: String((await getCurrentTimestamp(ethers.provider)) - 60),
      expirationTime: String((await getCurrentTimestamp(ethers.provider)) + 60),
      fees: [],
      salt: "0",
      extraParams: "0x",
      extraSignature: "0x",
      signatureVersion: Sdk.Blur.Types.SignatureVersion.SINGLE,
    });

    const exchange = new Contract(
      "0x000000000000Ad05Ccc4F10045630fb830B95127",
      new Interface(BlurAbi),
      ethers.provider
    );

    const bobBalanceBefore = await ethers.provider.getBalance(bob.address);

    await exchange.connect(alice).execute(
      {
        order: sellOrder.params,
        v: 0,
        r: HashZero,
        s: HashZero,
        extraSignature: "0x",
        signatureVersion: sellOrder.params.signatureVersion,
        blockNumber: 0,
      },
      {
        order: buyOrder.params,
        v: 0,
        r: HashZero,
        s: HashZero,
        extraSignature: "0x",
        signatureVersion: sellOrder.params.signatureVersion,
        blockNumber: 0,
      },
      {
        value: fee,
      }
    );

    const bobBalanceAfter = await ethers.provider.getBalance(bob.address);

    expect(bobBalanceAfter.sub(bobBalanceBefore)).to.eq(fee);
  });

  it("Charge BETH fees", async () => {
    const fee = parseEther("0.001").toString();

    // Deposit BETH
    await alice.sendTransaction({
      to: Sdk.Blur.Addresses.Beth[chainId],
      data: new Interface(["function deposit() payable"]).encodeFunctionData("deposit"),
      value: fee,
    });

    const buyOrder = new Sdk.Blur.Order(chainId, {
      trader: alice.address,
      side: Sdk.Blur.Types.TradeDirection.BUY,
      matchingPolicy: Sdk.Blur.Addresses.StandardPolicyERC721[chainId],
      collection: blurTransferHelper.address,
      tokenId: "0",
      amount: "1",
      paymentToken: Sdk.Blur.Addresses.Beth[chainId],
      price: fee,
      nonce: "0",
      listingTime: String((await getCurrentTimestamp(ethers.provider)) - 60),
      expirationTime: String((await getCurrentTimestamp(ethers.provider)) + 60),
      fees: [],
      salt: "0",
      extraParams: "0x",
      extraSignature: "0x",
      signatureVersion: Sdk.Blur.Types.SignatureVersion.SINGLE,
    });
    const sellOrder = new Sdk.Blur.Order(chainId, {
      trader: alice.address,
      side: Sdk.Blur.Types.TradeDirection.SELL,
      matchingPolicy: Sdk.Blur.Addresses.StandardPolicyERC721[chainId],
      collection: blurTransferHelper.address,
      tokenId: "0",
      amount: "1",
      paymentToken: Sdk.Blur.Addresses.Beth[chainId],
      price: fee,
      nonce: "0",
      listingTime: String((await getCurrentTimestamp(ethers.provider)) - 60),
      expirationTime: String((await getCurrentTimestamp(ethers.provider)) + 60),
      fees: [
        {
          rate: 10000,
          recipient: bob.address,
        },
      ],
      salt: "0",
      extraParams: "0x",
      extraSignature: "0x",
      signatureVersion: Sdk.Blur.Types.SignatureVersion.SINGLE,
    });

    const exchange = new Contract(
      "0x000000000000Ad05Ccc4F10045630fb830B95127",
      new Interface(BlurAbi),
      ethers.provider
    );

    const bobBalanceBefore = await new Sdk.Common.Helpers.Erc20(
      ethers.provider,
      Sdk.Blur.Addresses.Beth[chainId]
    ).getBalance(bob.address);

    await exchange.connect(alice).execute(
      {
        order: sellOrder.params,
        v: 0,
        r: HashZero,
        s: HashZero,
        extraSignature: "0x",
        signatureVersion: sellOrder.params.signatureVersion,
        blockNumber: 0,
      },
      {
        order: buyOrder.params,
        v: 0,
        r: HashZero,
        s: HashZero,
        extraSignature: "0x",
        signatureVersion: sellOrder.params.signatureVersion,
        blockNumber: 0,
      }
    );

    const bobBalanceAfter = await new Sdk.Common.Helpers.Erc20(
      ethers.provider,
      Sdk.Blur.Addresses.Beth[chainId]
    ).getBalance(bob.address);

    expect(bobBalanceAfter.sub(bobBalanceBefore)).to.eq(fee);
  });
});
