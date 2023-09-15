import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessor from "@reservoir0x/sdk/src/payment-processor";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupERC721C, configERC721C } from "../../../utils";

describe("PaymentProcessor - SingleToken - ERC721C - Only EOA", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let erc721c: Contract;

  const securityLevel = 6;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    ({ erc721c } = await setupERC721C(deployer));

    await configERC721C(deployer, erc721c, securityLevel, [], []);
  });

  afterEach(reset);

  it("Build and direct fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721c to seller
    await erc721c.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721c.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const takerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc721c.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: buyer.address,
      takerMasterNonce: takerMasterNonce,
    });
    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    sellOrder.checkSignature();

    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor",
          contractKind: "erc721",
          contract: erc721c.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          erc721cSecurityLevel: securityLevel,
          transferValidator: await erc721c.getTransferValidator(),
          price: price.toString(),
        },
      ],
      buyer.address,
      Sdk.Common.Addresses.Native[chainId],
      {
        source: "reservoir.market",
      }
    );

    for (const tx of nonPartialTx.txs) {
      const preSignatures: string[] = [];
      for (const { data: preSignature, kind } of tx.preSignatures) {
        if (kind === "erc721c-verfied-eoa") {
          const signature = await buyer.signMessage(preSignature.message);
          const transferValidator = preSignature.transferValidator;
          const validator = new Common.Helpers.CreatorTokenTransferValidator(ethers.provider, transferValidator);
          const isVerified = await validator.isVerifiedEOA(buyer.address);
          if (!isVerified) {
            const transaction = validator.verifyTransaction(buyer.address, signature); 
            await buyer.sendTransaction(transaction);
          }
        }

        if (kind === "payment-processor-take-order") {
          const signature = await buyer._signTypedData(
            preSignature.domain,
            preSignature.types,
            preSignature.value
          );
          preSignatures.push(signature);
        }
      }

      const newTxData = exchange.attachTakerSignatures(tx.txData.data, preSignatures);
      tx.txData.data = newTxData;

      await buyer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

});
