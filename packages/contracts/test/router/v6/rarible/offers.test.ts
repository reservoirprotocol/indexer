import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { encodeForMatchOrders } from "@reservoir0x/sdk/src/rarible/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import {
  SeaportERC721Approval,
  setupSeaportERC721Approvals,
} from "../helpers/seaport";
import { RaribleListing, setupRaribleOffers } from "../helpers/rarible";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../../utils";

describe("[ReservoirV6_0_0] Rarible offers", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let seaportApprovalOrderZone: Contract;
  let seaportModule: Contract;
  let raribleModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = (await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy())) as any;
    seaportApprovalOrderZone = (await ethers
      .getContractFactory("SeaportApprovalOrderZone", deployer)
      .then((factory) => factory.deploy())) as any;
    seaportModule = (await ethers
      .getContractFactory("SeaportModule", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;
    raribleModule = (await ethers
      .getContractFactory("RaribleModule", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Eth[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        seaportModule: await ethers.provider.getBalance(seaportModule.address),
        raribleModule: await ethers.provider.getBalance(raribleModule.address),
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
        seaportModule: await contract.getBalance(seaportModule.address),
        raribleModule: await contract.getBalance(raribleModule.address),
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

    const offers: RaribleListing[] = [];
    const fees: BigNumber[][] = [];
    for (let i = 0; i < offersCount; i++) {
      offers.push({
        side: "buy",
        maker: getRandomBoolean() ? alice : bob,
        nft: {
          kind: "erc721",
          contract: erc721,
          id: getRandomInteger(1, 10000),
          amount: 1,
        },
        price: parseEther(getRandomFloat(0.2, 2).toFixed(6)),
      });
      if (chargeFees) {
        fees.push([parseEther(getRandomFloat(0.0001, 0.1).toFixed(6))]);
      } else {
        fees.push([]);
      }
    }
    await setupRaribleOffers(offers);

    // In order to avoid giving NFT approvals to the router (remember,
    // the router is supposed to be stateless), we do create multiple
    // Seaport orders (we can also have a single aggregated order for
    // bundling everything together) which give the NFTs to the router
    // (eg. offer = NFT and consideration = NFT - with the router as a
    // private recipient). This way, the NFT approvals will be made on
    // the Seaport conduit and the router stays stateless.

    const approvals: SeaportERC721Approval[] = offers.map((offer) => ({
      giver: carol,
      filler: seaportModule.address,
      receiver: raribleModule.address,
      nft: {
        kind: "erc721",
        contract: offer.nft.contract,
        id: bn(offer.nft.id).toNumber(),
        amount: offer.nft.amount,
      },
      zone: seaportApprovalOrderZone.address,
    }));
    await setupSeaportERC721Approvals(approvals);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Fill the approval orders, so that we avoid giving approval to the router
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("matchOrders", [
          [
            ...approvals
              .map(({ orders }) => [
                // Regular order
                {
                  parameters: {
                    ...orders![0].params,
                    totalOriginalConsiderationItems:
                      orders![0].params.consideration.length,
                  },
                  signature: orders![0].params.signature,
                },
                // Mirror order
                {
                  parameters: {
                    ...orders![1].params,
                    totalOriginalConsiderationItems:
                      orders![1].params.consideration.length,
                  },
                  signature: "0x",
                },
              ])
              .flat(),
          ],
          // For each regular order, match the single offer item to the single consideration item
          [
            ...approvals.map((_, i) => ({
              offerComponents: [
                {
                  orderIndex: i * 2,
                  itemIndex: 0,
                },
              ],
              considerationComponents: [
                {
                  orderIndex: i * 2,
                  itemIndex: 0,
                },
              ],
            })),
          ],
        ]),
        value: 0,
      },
      // 2. Fill offers with the received NFTs
      ...offers.map((offer, i) => ({
        module: raribleModule.address,
        data: raribleModule.interface.encodeFunctionData("acceptERC721Offer", [
          encodeForMatchOrders(offer.order!.params),
          offer.order?.params.signature,
          encodeForMatchOrders(
            offer.order!.buildMatching(raribleModule.address, {
              tokenId: offer.nft.id,
              assetClass: "ERC721",
            })
          ),
          "0x",
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
    if (
      partial &&
      revertIfIncomplete &&
      offers.some(({ isCancelled }) => isCancelled)
    ) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions
            .map(({ value }) => value)
            .reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith(
        "reverted with custom error 'UnsuccessfulExecution()'"
      );

      return;
    }

    // Fetch pre-state

    const balancesBefore = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Weth[chainId]);

    // Checks

    // Carol got the payment
    expect(balancesAfter.carol.sub(balancesBefore.carol)).to.eq(
      offers
        .map((offer, i) =>
          offer.isCancelled
            ? bn(0)
            : bn(offer.price)
                .sub(
                  offer.fees
                    ?.map(({ amount }) => bn(amount))
                    .reduce((a, b) => a.add(b)) ?? 0
                )
                .sub(fees[i].reduce((a, b) => bn(a).add(b), bn(0)))
        )
        .reduce((a, b) => bn(a).add(b), bn(0))
    );

    // Emilio got the fee payments
    if (chargeFees) {
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(
        offers
          .map((_, i) => fees[i])
          .map((executionFees) =>
            executionFees.reduce((a, b) => bn(a).add(b), bn(0))
          )
          .reduce((a, b) => bn(a).add(b), bn(0))
      );
    }

    // The maker got the NFTs of the filled orders
    for (const { maker, nft, isCancelled } of offers) {
      if (!isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(maker.address);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.raribleModule).to.eq(0);
  };

  // Test various combinations for filling offers

  for (let multiple of [false, true]) {
    for (let partial of [false, true]) {
      for (let chargeFees of [false, true]) {
        for (let revertIfIncomplete of [false, true]) {
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
