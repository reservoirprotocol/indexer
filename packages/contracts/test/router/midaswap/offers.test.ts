import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { MidaswapOffer, setupMidaswapOffers } from "../helpers/midaswap";
import { bn, getChainId, getRandomBoolean, getRandomInteger, reset, setupNFTs } from "../../utils";

import LPTokenAbi from "@reservoir0x/sdk/src/midaswap/abis/LPToken.json";
import RouterAbi from "@reservoir0x/sdk/src/midaswap/abis/Router.json";

describe("[ReservoirV6_0_1] Midaswap offers", () => {
  const chainId = getChainId();
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let midaRouter: Contract;
  let midaswapModule: Contract;
  const deadline = Date.now() + 100 * 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    midaswapModule = await ethers
      .getContractFactory("MidaswapModule", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.Midaswap.Addresses.PairFactory[chainId],
          Sdk.Midaswap.Addresses.Router[chainId],
          Sdk.Common.Addresses.WNative[chainId]
        )
      );
    midaRouter = new Contract(Sdk.Midaswap.Addresses.Router[chainId], RouterAbi, ethers.provider);
  });

  afterEach(reset);

  const testAcceptOffers = async (
    // Whether to charge fees on the received amount
    chargeFees: boolean,
    // Whether to revert or not in case of any failures
    revertIfIncomplete: boolean,
    // Whether to cancel some orders in order to trigger partial filling
    partial: boolean,
    // Number of offers to fill
    offersCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    const offers: MidaswapOffer[] = [];
    const fees: BigNumber[][] = [];
    const bin = getRandomInteger(8298609, 8395508);
    const swapPrice = Sdk.Midaswap.Order.binToPriceFixed(bin);
    for (let i = 0; i < offersCount; i++) {
      const isCancelled = partial && getRandomBoolean();
      if (!isCancelled) {
        offers.push({
          // buyer: getRandomBoolean() ? alice : bob,
          buyer: bob,
          nft: {
            contract: erc721,
            id: getRandomInteger(1, 10000),
          },
          price: parseEther(swapPrice),
          bin,
          isCancelled,
        });
        if (chargeFees) {
          const fee = parseEther(swapPrice).div(10);
          fees.push([fee]);
        } else {
          fees.push([]);
        }
      }
    }
    if (offers.length === 0) {
      return;
    }
    await setupMidaswapOffers(offers);

    // Send the NFTs to the module (in real-world this will be done atomically)
    for (const offer of offers) {
      const txmint = await offer.nft.contract.connect(carol).mint(offer.nft.id);
      await txmint.wait();
      const toModuleTx = await offer.nft.contract
        .connect(carol)
        .transferFrom(carol.address, midaswapModule.address, offer.nft.id);
      await toModuleTx.wait();
    }

    // Prepare executions
    const encodeBefore = (offer: { nft: { id: number } }, i: number) => {
      const tempData = [
        erc721.address,
        Sdk.Common.Addresses.Native[chainId],
        offer.nft.id,
        {
          fillTo: carol.address,
          refundTo: carol.address,
          revertIfIncomplete,
        },
        [
          ...fees[i].map((amount) => ({
            recipient: emilio.address,
            amount,
          })),
        ],
      ];
      return tempData;
    };
    const executions: ExecutionInfo[] = [
      ...offers.map((offer, i) => ({
        module: midaswapModule.address,
        data: midaswapModule.interface.encodeFunctionData("sell", encodeBefore(offer, i)),
        value: 0,
      })),
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (partial && revertIfIncomplete && offers.some(({ isCancelled }) => isCancelled)) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Execute

    const tx = await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });
    await tx.wait();
    let allGas = bn(0);
    // Fetch post-state
    const balancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
    const gasUsed = txReceipt.cumulativeGasUsed.mul(txReceipt.effectiveGasPrice);
    allGas = gasUsed;

    // Checks

    // Carol got the payment
    const targetPrice = offers
      .map((offer, i) =>
        bn(offer.price)
          .mul(1000)
          .div(1005)
          .sub(fees[i].reduce((a, b) => bn(a).add(b), bn(0)))
      )
      .reduce((a, b) => bn(a).add(b), bn(0));
    expect(
      balancesAfter.carol
        .sub(balancesBefore.carol)
        .add(allGas)
        .div(10000)
        .sub(bn(targetPrice).div(10000))
        .abs()
    ).to.be.lt(1000000);

    // Emilio got the fee payments
    if (chargeFees) {
      const emilioTargetFee = offers
        .map((_, i) => (offers[i].isCancelled ? [] : fees[i]))
        .map((executionFees) => executionFees.reduce((a, b) => bn(a).add(b), bn(0)))
        .reduce((a, b) => bn(a).add(b), bn(0));
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(emilioTargetFee);
    }
    const lpContract = new Contract(offers![0]!.lpInfo!.lpAddress, LPTokenAbi, ethers.provider);

    for (const { buyer, lpInfo } of offers) {
      const approve = await lpContract.connect(buyer).setApprovalForAll(midaRouter.address, true);
      await approve.wait();
      const remove = await midaRouter
        .connect(buyer)
        .removeLiquidityETH(
          erc721.address,
          Sdk.Common.Addresses.WNative[chainId],
          lpInfo?.lpTokenId,
          deadline
        );
      await remove.wait();
    }

    // Alice and Bob got the NFTs of the filled orders
    for (const { buyer, nft, isCancelled } of offers) {
      if (!isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(buyer.address);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.midaswapModule).to.eq(0);
  };
  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        midaswapModule: await ethers.provider.getBalance(midaswapModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await contract.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        david: await contract.getBalance(david.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        midaswapModule: await contract.getBalance(midaswapModule.address),
      };
    }
  };

  // Test various combinations for filling offers
  for (const multiple of [false, true]) {
    for (const partial of [false, true]) {
      for (const chargeFees of [false, true]) {
        for (const revertIfIncomplete of [false, true]) {
          it(
            `${multiple ? "[multiple-orders]" : "[single-order]"}` +
              `${partial ? "[partial]" : "[full]"}` +
              `${chargeFees ? "[fees]" : "[no-fees]"}` +
              `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`,
            async () =>
              testAcceptOffers(
                chargeFees,
                revertIfIncomplete,
                partial,
                multiple ? getRandomInteger(2, 4) : 1
              )
          );
        }
      }
    }
  }
});
