import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Blend from "@reservoir0x/sdk/src/blend";
import { Builders } from "@reservoir0x/sdk/src/seaport-base";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { hexZeroPad, splitSignature } from "@ethersproject/bytes";

import {
  bn,
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
  setupTokens,
} from "../../utils";
import { defaultAbiCoder } from "@ethersproject/abi";
import { _TypedDataEncoder } from "@ethersproject/hash";
import {
    EIP712_DOMAIN,
    EIP712_LOAN_OFFER_TYPES,
    EIP712_SELL_OFFER_TYPES,
    EIP712_ORACLE_OFFER_TYPES
} from "@reservoir0x/sdk/src/blend/order";

describe("Blend", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let ted: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, ted, carol] = await ethers.getSigners();

    ({ erc20 } = await setupTokens(deployer));
    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build loan offer and borrow and buyLocked", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    const BETH = '0x0000000000a39bb272e79075ade125fd351887ac';

    const beth = new Contract(
        BETH,
        new ethers.utils.Interface(["function deposit() public payable"]),
        ethers.provider
    );

    const blendOwner = '0xFA9fB502534761dBDDAcf5B7e2Aa84684815F1bb';
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [blendOwner],
    });
    await network.provider.request({
      method: "hardhat_setBalance",
      params: [blendOwner, "0x1000000000000000000"],
    });

    const blenderDeployer = await ethers.getSigner(blendOwner);
    const oracle = buyer;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Blend.Addresses.Blend[chainId]);

    const exchange = new Blend.Exchange(chainId);
    const lender = buyer;

    // Deposit beth
    await beth.connect(lender).deposit({ value: price })
    await beth.connect(carol).deposit({ value: price })

    await exchange.contract.connect(blenderDeployer).setOracle(oracle.address, true);

    const nonce = await exchange.contract.connect(lender).nonces(lender.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);
    const loanOffer = {
        lender: buyer.address,
        collection: erc721.address,
        totalAmount: price,
        minAmount: 0,
        maxAmount: price,
        auctionDuration: 9000,
        salt: "265875887785256855606558013756560384533",
        expirationTime: (blockTime + 60 * 60).toString(),
        rate: 0,
        oracle: oracle.address,
        nonce
    }
    
    // sign Lender Offer
    const hash = _TypedDataEncoder.hashStruct("LoanOffer", EIP712_LOAN_OFFER_TYPES, loanOffer);
    // console.log("hash", hash)
    const offerSignature =  await lender._signTypedData(EIP712_DOMAIN(chainId), EIP712_LOAN_OFFER_TYPES, loanOffer);

    // oracle sign
    const blockNumber = await ethers.provider.getBlockNumber();
    const oracleSignature = await oracle._signTypedData(
        EIP712_DOMAIN(chainId),
        EIP712_ORACLE_OFFER_TYPES,
        {
            hash,
            blockNumber
        }
    )
    // blenderDeployer.
    const signature = `${offerSignature}${oracleSignature.slice(2)}` + defaultAbiCoder.encode([
        "uint256"
    ], [
        blockNumber
    ]).slice(2);


    const loanAmount = price
    const collateralTokenId = soldTokenId;

    const txData = await exchange.contract.connect(seller).populateTransaction.borrow(
        loanOffer,
        signature,
        loanAmount,
        collateralTokenId
    );

    const result = await seller.sendTransaction({
        ...txData,
        gasLimit: 10000000
    });

    let lienId = '';
    let lien = null
    const recepient = await result.wait();
    const block = await ethers.provider.getBlock(recepient.blockNumber);
    for(const log of recepient.logs) {
        try {
            const parsedLog = exchange.contract.interface.parseLog(log);
            if (parsedLog.name === "LoanOfferTaken") {
                const args = parsedLog.args;
                lienId = parsedLog.args.lienId.toString();
                // console.log("args", args)
                lien = {
                    lender: args.lender,
                    borrower: args.borrower,
                    collection: args.collection,
                    tokenId: args.tokenId,
                    amount: args.loanAmount,
                    rate: args.rate,
                    auctionStartBlock: 0,
                    startTime: block.timestamp,
                    auctionDuration: args.auctionDuration,
                }     
            }
        } catch {
        }
    }

    const borrower = seller;

    const sellOffer = {
        borrower: borrower.address,
        lienId,
        price: price.toString(),
        expirationTime: (blockTime + 60 * 60).toString(),
        salt: "265875887785256855606558013756560384533",
        oracle: oracle.address,
        fees: [],
        nonce: nonce.toString()
    }

    // console.log("lien", lien)
     // sign Lender Offer
     const sellOfferHash = _TypedDataEncoder.hashStruct("SellOffer", EIP712_SELL_OFFER_TYPES, sellOffer);
    //  console.log("sellOfferHash", sellOfferHash)
     const sellOfferSignature =  await borrower._signTypedData(EIP712_DOMAIN(chainId), EIP712_SELL_OFFER_TYPES, sellOffer);
 
     // oracle sign
     const sellOracleSignature = await oracle._signTypedData(
         EIP712_DOMAIN(chainId),
         EIP712_ORACLE_OFFER_TYPES,
         {
            hash: sellOfferHash,
            blockNumber
         }
     )
    //  console.log({
    //     sellOfferSignature: splitSignature(sellOfferSignature),
    //     sellOracleSignature,
    //     blockNumber
    //  })
     const sellSignature = `${sellOfferSignature}${sellOracleSignature.slice(2)}` + defaultAbiCoder.encode([
         "uint256"
     ], [
        blockNumber
     ]).slice(2);

    const order = new Blend.Order(chainId, {
        ...sellOffer,
        signature: sellSignature
    });

    order.checkSignature();
    order.checkFillability(ethers.provider);


    await exchange.fillOrder(carol, order, lien!)
    // const sellTxData = await exchange.contract.connect(carol).populateTransaction.buyLocked(
    //     lien,
    //     sellOffer,
    //     sellSignature
    // );
    
    // await carol.sendTransaction({
    //     ...sellTxData,
    //     gasLimit: 10000000
    // });
 
    // console.log("result", recepient)
    // // Build sell order
    // const sellOrder = builder.build({
    //   side: "sell",
    //   tokenKind: "erc721",
    //   offerer: seller.address,
    //   contract: erc721.address,
    //   tokenId: soldTokenId,
    //   paymentToken: Common.Addresses.Eth[chainId],
    //   price,
    //   counter: 0,
    //   startTime: await getCurrentTimestamp(ethers.provider),
    //   endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    // }, SeaportV11.Order);

    // // Sign the order
    // await sellOrder.sign(seller);

    // await sellOrder.checkFillability(ethers.provider);

    // // Create matching params
    // const matchParams = sellOrder.buildMatching();

    // const buyerEthBalanceBefore = await ethers.provider.getBalance(
    //   buyer.address
    // );
    // const sellerEthBalanceBefore = await ethers.provider.getBalance(
    //   seller.address
    // );
    // const ownerBefore = await nft.getOwner(soldTokenId);

    // expect(ownerBefore).to.eq(seller.address);

    // // Match orders
    // await exchange.fillOrder(buyer, sellOrder, matchParams, {
    //   source: "reservoir.market",
    // });

    // const buyerEthBalanceAfter = await ethers.provider.getBalance(
    //   buyer.address
    // );
    // const sellerEthBalanceAfter = await ethers.provider.getBalance(
    //   seller.address
    // );
    const ownerAfter = await nft.getOwner(soldTokenId);

    // expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    // expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(ownerAfter).to.eq(carol.address);
  });

});
