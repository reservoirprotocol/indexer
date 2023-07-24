import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../utils";
import { ElementOffer, setupElementOffers } from "../helpers/element";

describe("[ReservoirV6_0_1] Element offers", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let elementModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    elementModule = await ethers
      .getContractFactory("ElementModule", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, Sdk.Element.Addresses.Exchange[chainId])
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        elementModule: await ethers.provider.getBalance(elementModule.address),
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
        elementModule: await contract.getBalance(elementModule.address),
      };
    }
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
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol

    const offers: ElementOffer[] = [];
    const fees: BigNumber[][] = [];
    for (let i = 0; i < offersCount; i++) {
      offers.push({
        buyer: getRandomBoolean() ? alice : bob,
        nft: {
          kind: "erc721",
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
    await setupElementOffers(offers);

    // Send the NFTs to the module (in real-world this will be done atomically)
    for (const offer of offers) {
      await offer.nft.contract.connect(carol).mint(offer.nft.id);
      await offer.nft.contract
        .connect(carol)
        .transferFrom(carol.address, elementModule.address, offer.nft.id);
    }

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Fill offers with the received NFTs
      ...offers.map((offer, i) => ({
        module: elementModule.address,
        data: elementModule.interface.encodeFunctionData("acceptERC721Offer", [
          offer.order!.getRaw(),
          offer.order!.getRaw(),
          {
            fillTo: carol.address,
            refundTo: carol.address,
            revertIfIncomplete,
          },
          offer.nft.id,
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
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.WNative[chainId]);

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.WNative[chainId]);

    // Checks

    // Carol got the payment
    expect(balancesAfter.carol.sub(balancesBefore.carol)).to.eq(
      offers
        .map((offer, i) =>
          offer.isCancelled
            ? bn(0)
            : bn(offer.price).sub(fees[i].reduce((a, b) => bn(a).add(b), bn(0)))
        )
        .reduce((a, b) => bn(a).add(b), bn(0))
    );

    // Emilio got the fee payments
    if (chargeFees) {
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(
        offers
          .map((_, i) => (offers[i].isCancelled ? [] : fees[i]))
          .map((executionFees) => executionFees.reduce((a, b) => bn(a).add(b), bn(0)))
          .reduce((a, b) => bn(a).add(b), bn(0))
      );
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
    expect(balancesAfter.elementModule).to.eq(0);
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
