import { BigNumber } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { CaviarOffer, setupCaviarOffers } from "../helpers/caviar-v1";
import { bn, getRandomBoolean, getRandomFloat, getRandomInteger, reset } from "../../utils";

describe("[ReservoirV6_0_1] CaviarV1 offers", () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let caviarV1Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());

    caviarV1Module = await ethers
      .getContractFactory("CaviarV1Module", deployer)
      .then((factory) => factory.deploy(deployer.address, router.address));
  });

  const getBalances = async () => {
    return {
      alice: await ethers.provider.getBalance(alice.address),
      bob: await ethers.provider.getBalance(bob.address),
      carol: await ethers.provider.getBalance(carol.address),
      david: await ethers.provider.getBalance(david.address),
      emilio: await ethers.provider.getBalance(emilio.address),
      router: await ethers.provider.getBalance(router.address),
      caviarV1Module: await ethers.provider.getBalance(caviarV1Module.address),
    };
  };

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
    const offers: CaviarOffer[] = [];
    const fees: BigNumber[][] = [];
    for (let i = 0; i < offersCount; i++) {
      const erc721 = await ethers
        .getContractFactory("MockERC721", deployer)
        .then((factory) => factory.deploy());

      offers.push({
        buyer: getRandomBoolean() ? alice : bob,
        nft: {
          contract: erc721,
          id: getRandomInteger(1, 10000),
        },
        price: parseEther(getRandomFloat(0.2, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      });

      if (chargeFees) {
        fees.push([parseEther(getRandomFloat(0.0001, 0.1).toFixed(6))]);
      } else {
        fees.push([]);
      }
    }

    await setupCaviarOffers(offers);

    // Send the NFTs to the module (in real-world this will be done atomically)
    for (const offer of offers) {
      await offer.nft.contract.connect(carol).mint(offer.nft.id);
      await offer.nft.contract
        .connect(carol)
        .transferFrom(carol.address, caviarV1Module.address, offer.nft.id);
    }

    // Prepare executions
    const executions: ExecutionInfo[] = [
      // 1. Fill offers with the received NFTs
      ...offers.map((offer, i) => ({
        module: caviarV1Module.address,
        data: caviarV1Module.interface.encodeFunctionData("sell", [
          offer.order!.params.pool,
          offer.nft.id,
          bn(offer.order!.params.extra.prices[0]),
          { id: HashZero, payload: [], timestamp: 0, signature: [] },
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
        ]),
        value: 0,
      })),
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (partial && revertIfIncomplete && offers.some(({ isCancelled }) => isCancelled)) {
      await expect(router.connect(carol).execute(executions)).to.be.revertedWith(
        "reverted with custom error 'UnsuccessfulExecution()'"
      );

      return;
    }

    // Fetch pre-state
    const balancesBefore = await getBalances();
    const poolBalancesBefore = Object.fromEntries(
      await Promise.all(
        offers.map(async ({ order }) => [
          order!.params.pool,
          await ethers.provider.getBalance(order!.params.pool),
        ])
      )
    );

    // Execute
    await router.connect(carol).execute(executions);

    // Fetch post-state
    const balancesAfter = await getBalances();
    const poolBalancesAfter = Object.fromEntries(
      await Promise.all(
        offers.map(async ({ order }) => [
          order!.params.pool,
          await ethers.provider.getBalance(order!.params.pool),
        ])
      )
    );

    for (const { order, isCancelled } of offers) {
      const { pool, extra } = order!.params;

      // Pool got the payment
      expect(poolBalancesBefore[pool].sub(poolBalancesAfter[pool])).to.eq(
        isCancelled ? bn(0) : bn(extra.prices[0])
      );
    }

    // Emilio got the fee payments
    if (chargeFees) {
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(
        offers
          .map((_, i) => (offers[i].isCancelled ? [] : fees[i]))
          .map((executionFees) => executionFees.reduce((a, b) => bn(a).add(b), bn(0)))
          .reduce((a, b) => bn(a).add(b), bn(0))
      );
    }

    // Pool got the NFT
    for (const { nft, isCancelled, order } of offers) {
      if (!isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.hexEqual(order!.params.pool);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.caviarV1Module).to.eq(0);
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
