import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import axios from "axios";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { bn, getChainId, getRandomFloat, reset } from "../../utils";

// WARNING! These tests are flaky!
describe("[ReservoirV6_0_1] X2Y2 offers", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let x2y2Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    x2y2Module = await ethers
      .getContractFactory("X2Y2Module", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.X2Y2.Addresses.Exchange[chainId],
          Sdk.X2Y2.Addresses.Erc721Delegate[chainId],
          Sdk.X2Y2.Addresses.Erc1155Delegate[chainId]
        )
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
        x2y2Module: await ethers.provider.getBalance(x2y2Module.address),
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
        x2y2Module: await contract.getBalance(x2y2Module.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptOffers = async (
    // Whether to include fees on top
    chargeFees: boolean,
    // Number of offers to fill
    offersCount: number
  ) => {
    // Setup

    // Taker: Carol
    // Fee recipient: Emilio

    const x2y2Interface = new Interface(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../../../../artifacts/contracts/interfaces/IX2Y2.sol/IX2Y2.json").abi
    );

    const orders = await axios
      .get("https://api.x2y2.org/api/offers?status=open", {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": String(process.env.X2Y2_API_KEY),
        },
      })
      .then((data) =>
        data.data.data.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (order: any) =>
            // For ease of accessing the token id we only test with single token offers
            !order.is_collection_offer && order.contract.erc_type === 0
        )
      );

    const offers: Sdk.X2Y2.Order[] = [];
    const inputs: object[] = [];
    const fees: BigNumber[][] = [];
    for (let i = 0; i < offersCount; i++) {
      const orderData = orders[i];
      const order = new Sdk.X2Y2.Order(chainId, {
        kind: "single-token",
        id: orderData.id,
        type: orderData.type,
        currency: orderData.currency,
        price: orderData.price,
        maker: orderData.maker.address,
        taker: orderData.taker.address,
        deadline: orderData.end_at,
        itemHash: orderData.item_hash,
        nft: {
          token: orderData.contract.contract,
          tokenId: orderData.nft.token_id,
        },
        royalty_fee: orderData.royalty_fee,
      });
      offers.push(order);

      const response = await axios.post(
        "https://api.x2y2.org/api/orders/sign",
        {
          caller: x2y2Module.address,
          op: Sdk.X2Y2.Types.Op.COMPLETE_BUY_OFFER,
          amountToEth: "0",
          amountToWeth: "0",
          check: false,
          items: [
            {
              orderId: order.params.id,
              currency: order.params.currency,
              price: order.params.price,
            },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": process.env.X2Y2_API_KEY!,
          },
        }
      );
      const decodedFunctionData = x2y2Interface.decodeFunctionData(
        "run",
        x2y2Interface.getSighash("run") + response.data.data[0].input.slice(2)
      );
      inputs.push(decodedFunctionData.input);

      if (chargeFees) {
        fees.push([parseEther(getRandomFloat(0.0001, 0.001).toFixed(6))]);
      } else {
        fees.push([]);
      }
    }

    // Send the NFTs to the module (in real-world this will be done atomically)
    await Promise.all(
      offers.map(async (offer) => {
        const contract = new Sdk.Common.Helpers.Erc721(ethers.provider, offer.params.nft.token);
        const owner = await contract.getOwner(offer.params.nft.tokenId!);

        await network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [owner],
        });
        const signer = await ethers.getSigner(owner);
        await contract.contract
          .connect(signer)
          .transferFrom(owner, x2y2Module.address, offer.params.nft.tokenId!);
      })
    );

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Fill offers with the received NFTs
      ...offers.map((_, i) => ({
        module: x2y2Module.address,
        data: x2y2Module.interface.encodeFunctionData("acceptERC721Offer", [
          inputs[i],
          {
            fillTo: carol.address,
            refundTo: carol.address,
            revertIfIncomplete: true,
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
          bn(offer.params.price)
            .sub(
              // Take into consideration the protocol fee
              bn(offer.params.price).mul(50).div(10000)
            )
            .sub(bn(offer.params.price).mul(offer.params.royalty_fee).div(1000000))
            .sub(fees[i].reduce((a, b) => bn(a).add(b), bn(0)))
        )
        .reduce((a, b) => bn(a).add(b), bn(0))
    );

    // Emilio got the fee payments
    if (chargeFees) {
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(
        offers
          .map((_, i) => fees[i])
          .map((executionFees) => executionFees.reduce((a, b) => bn(a).add(b), bn(0)))
          .reduce((a, b) => bn(a).add(b), bn(0))
      );
    }

    // // Alice and Bob got the NFTs of the filled orders
    // for (const { buyer, nft, isCancelled } of offers) {
    //   if (!isCancelled) {
    //     expect(await nft.contract.ownerOf(nft.id)).to.eq(buyer.address);
    //   } else {
    //     expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
    //   }
    // }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.x2y2Module).to.eq(0);
  };

  for (const multiple of [false, true]) {
    for (const chargeFees of [false, true]) {
      it(
        "[eth]" +
          `${multiple ? "[multiple-orders]" : "[single-order]"}` +
          `${chargeFees ? "[fees]" : "[no-fees]"}`,
        async () => testAcceptOffers(chargeFees, multiple ? 2 : 1)
      );
    }
  }
});
