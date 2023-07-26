import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { NFTXOffer } from "../helpers/nftx";
import { ExecutionInfo } from "../helpers/router";
import { bn, getChainId, getRandomBoolean, getRandomFloat, reset } from "../../utils";

describe("[ReservoirV6_0_1] NFTX offers (with 0x routing)", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let nftxZeroExModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, emilio] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    nftxZeroExModule = await ethers
      .getContractFactory("NFTXZeroExModule", deployer)
      .then((factory) =>
        factory.deploy(
          router.address,
          router.address,
          Sdk.Nftx.Addresses.ZeroExMarketplaceZap[chainId]
        )
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        nftxZeroExModule: await ethers.provider.getBalance(nftxZeroExModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        nftxZeroExModule: await contract.getBalance(nftxZeroExModule.address),
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
    partial: boolean
  ) => {
    // Setup

    // Token owner = alice
    const owner = "0xc8c9771b59f9f217e8285889b9cdd7b9ddce0e86";
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [owner],
    });
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [owner, "0x1000000000000000000"],
    });
    carol = await ethers.getSigner(owner);

    // Collection = milady
    const collection = "0x5af0d9827e0c53e4799bb226655a1de152a425a5";
    const vault = "0x227c7DF69D3ed1ae7574A1a7685fDEd90292EB48";
    const vaultId = 392;
    const tokensInVault = [4341, 7028];
    const tokenId = 4341;

    const factory = await ethers.getContractFactory("MockERC721", deployer);

    const offers: NFTXOffer[] = [];
    const fees: BigNumber[][] = [];
    for (let i = 0; i < tokensInVault.length; i++) {
      const erc721 = factory.attach(collection);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offer: any = {
        buyer: getRandomBoolean() ? alice : bob,
        nft: {
          contract: erc721,
          id: tokensInVault[i],
        },
        price: parseEther(getRandomFloat(0.6, 5).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      };

      const poolPrice = await Sdk.Nftx.Helpers.getPoolPriceFrom0x(
        vault,
        1,
        "sell",
        100,
        ethers.provider
      );

      if (poolPrice.price) {
        offer.price = bn(poolPrice.price);
        offer.vault = vault;
        offer.order = new Sdk.Nftx.Order(chainId, {
          vaultId: vaultId.toString(),
          pool: vault,
          collection: offer.nft.contract.address,
          currency: Sdk.Common.Addresses.Native[chainId],
          specificIds: [offer.nft.id.toString()],
          price: offer.isCancelled ? offer.price.mul(bn(10)).toString() : offer.price.toString(),
          extra: {
            prices: [offer.price.toString()],
          },
          swapCallData: poolPrice.swapCallData,
          path: [],
        });
      }

      offers.push(offer);

      if (chargeFees) {
        fees.push([parseEther(getRandomFloat(0.0001, 0.1).toFixed(6))]);
      } else {
        fees.push([]);
      }
    }

    const erc721 = factory.attach(collection);
    await erc721.connect(carol).transferFrom(carol.address, nftxZeroExModule.address, tokenId);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      ...offers
        .filter((_) => _.order)
        .map((offer, i) => ({
          module: nftxZeroExModule.address,
          data: nftxZeroExModule.interface.encodeFunctionData("sell", [
            [offer.order?.params],
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
    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state
    const balancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

    // Carol got the payment
    const orderFee = offers
      .map((_, i) => (offers[i].isCancelled ? [] : fees[i]))
      .map((executionFees) => executionFees.reduce((a, b) => bn(a).add(b), bn(0)))
      .reduce((a, b) => bn(a).add(b), bn(0));

    // Emilio got the fee payments
    if (chargeFees) {
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(orderFee);
    }

    // Alice and Bob got the NFTs of the filled orders
    for (const { nft, isCancelled, vault } of offers) {
      if (!isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(vault);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.nftxZeroExModule).to.eq(0);
  };

  for (const partial of [false, true]) {
    for (const chargeFees of [false, true]) {
      for (const revertIfIncomplete of [false, true]) {
        const testCaseName =
          `${partial ? "[partial]" : "[full]"}` +
          `${chargeFees ? "[fees]" : "[no-fees]"}` +
          `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`;

        it(testCaseName, async () => testAcceptOffers(chargeFees, revertIfIncomplete, partial));
      }
    }
  }
});
