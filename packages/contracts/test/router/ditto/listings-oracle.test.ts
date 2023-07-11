import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import abiErc20 from "../../../../sdk/src/ditto/abis/Erc20.json";
import abiErc721 from "../../../../sdk/src/ditto/abis/Erc721.json";
import abiDittoAppraisal from "../../../../sdk/src/ditto/abis/Appraisal.json";
import abiDittoPoolFactory from "../../../../sdk/src/ditto/abis/PoolFactory.json";
import abiUpshotOracle from "../../../../sdk/src/ditto/abis/Oracle.json";


import * as Sdk from "../../../../sdk/src";

/**
 * run with the following command:
 * 
 * BLOCK_NUMBER="9329195" npx hardhat test test/router/ditto/listings-oracle.test.ts
 */
describe("DittoModule", () => {

    let initialTokenBalance: any;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    beforeEach(async () => {

        [deployer] = await ethers.getSigners();

        let adminAddress = "0x00000000000000000000000000000000DeaDBeef";
        alice = await ethers.getImpersonatedSigner(adminAddress); 
        

        initialTokenBalance = "10000000000000000000";
    });

    it("Accept multiple listings", async () => {

        const tokenId04 = 4;

        const nft: Contract = new Contract(
            ethers.utils.getAddress("0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6"),
            abiErc721,
            ethers.provider 
        );
    
        const token: Contract = new Contract(
            ethers.utils.getAddress("0x607702b48528C2883ADF0A24b8A5e1b5988082d6"),
            abiErc20,
            ethers.provider 
        );

        const dittoPoolFactory: Contract = new Contract(
            Sdk.Ditto.Addresses.PoolFactory[5], //ethers.utils.getAddress("0x595D6E2B8b0D78c260f5552FE2fc3143b0451Ef0"),
            abiDittoPoolFactory,
            ethers.provider 
        );
        
        await nft.connect(alice).mint(alice.address, tokenId04);
        await nft.connect(alice).setApprovalForAll(dittoPoolFactory.address, true);
        await token.connect(alice).mint(alice.address, parseEther("1"));
        await token.connect(alice).approve(dittoPoolFactory.address, parseEther("100"));
        
        await token.balanceOf(alice.address).then((balance: any) => {
            expect(balance).to.equal(parseEther("1"));
        });

        await nft.ownerOf(tokenId04).then((owner: string) => {
            expect(owner).to.equal(alice.address);
        });

        let ORACLE_ADDRESS = "0xB686C09fD6d9d86C462B82B0b23EF275833805E3";

        const isPrivatePool: any = false;
        const templateIndex: any = 6; //DittoPoolApp
        const tokenAddress: any = "0x607702b48528C2883ADF0A24b8A5e1b5988082d6";
        const nftAddress: any = "0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6";
        const feeLp: any = 0;
        const ownerAddress: any = alice.address;
        const feeAdmin: any = 0;
        const delta: any = 0; //NOOP
        const basePrice: any = 0; //NOOP
        const nftIdList: any[] = [tokenId04];
        const initialTokenBalance: any = "1000000000000000000";
        const templateInitData: any = ethers.utils.defaultAbiCoder.encode(["address", "uint256", "uint256"], [ORACLE_ADDRESS, "1", "10000000000000000000"]);
        const referrer: any = new Uint8Array([]);

        const poolTemplate: any = {
            isPrivatePool: isPrivatePool,
            templateIndex: templateIndex,
            token: tokenAddress,
            nft: nftAddress,
            feeLp: feeLp,
            owner: ownerAddress,
            feeAdmin: feeAdmin,
            delta: delta,
            basePrice: basePrice,
            nftIdList: nftIdList,
            initialTokenBalance: initialTokenBalance,
            templateInitData: templateInitData,
            referrer: referrer
        };

        const mngrTemplateIndex = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        const mngrInitData = new Uint8Array([]);

        const poolManagerTemplate: any = {
            templateIndex: mngrTemplateIndex,
            templateInitData: mngrInitData
        };

        const permitterTemplateIndex = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        const permitterInitData = new Uint8Array([]);
        const liquidityDepositPermissionData = new Uint8Array([]);

        const permitterTemplate = {
            templateIndex: permitterTemplateIndex,
            templateInitData: permitterInitData,
            liquidityDepositPermissionData: liquidityDepositPermissionData
        };

        console.log("-- A --");
        const txn06 = await dittoPoolFactory.connect(deployer).createDittoPool(
            poolTemplate,
            poolManagerTemplate,
            permitterTemplate
        );
        let output = await txn06.wait();  

        const event: any = output.events.find((event: { event: string; }) => event.event === 'DittoPoolFactoryDittoPoolCreated');
        const dpAddress = event.args.dittoPool;
    
        try {
            console.log(`DittoPoolApp: ${dpAddress}`);
        } catch (err) {
            console.error('Error occurred:', err);
        }

        const dittoPool: Contract = new Contract(
            dpAddress,
            abiDittoAppraisal,
            ethers.provider 
        );
       
        const oracleAddress: any = await dittoPool.oracle();
        console.log("oracleAddress: ", oracleAddress);
        expect(oracleAddress).to.eq(ORACLE_ADDRESS);

        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        console.log("              wallet.address", wallet.address); 

        let timestamp = 0;
        let expiration = "79228162514264337593543950335"
        let price = "1000000000000000000"
        let messageHash = ethers.utils.solidityKeccak256(
            [
                'uint256',
                'uint256',
                'address',
                'uint256',
                'address',
                'uint256',
                'uint96',
                'uint96'
            ],
            [
                5, //block.chainId
                1, //data.nonce,
                "0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6", //data.nft, 
                tokenId04, //data.nftId, 
                "0x607702b48528C2883ADF0A24b8A5e1b5988082d6", //data.token, 
                price, //data.price, 
                timestamp, //0, //data.timestamp,
                expiration //"79228162514264337593543950335", //data.expiration
            ]
        ); 
        let messageHashBytes = ethers.utils.arrayify(messageHash)
        let flatSig = await wallet.signMessage(messageHashBytes);

        const priceData: any = {
            signature: flatSig,
            nonce: 1,
            nft: "0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6",
            nftId: tokenId04,
            token: "0x607702b48528C2883ADF0A24b8A5e1b5988082d6",
            price: price,
            timestamp: timestamp, //0,
            expiration: expiration //"79228162514264337593543950335"    
        };

        const swapData = ethers.utils.defaultAbiCoder.encode(
            ['tuple(bytes signature,uint256 nonce,address nft,uint256 nftId,address token,uint256 price,uint96 timestamp,uint96 expiration)[]'],
            [[priceData]]
          );

        console.log("swapData: ", swapData)
    
        const args = {
            nftIds: [tokenId04],
            maxExpectedTokenInput: parseEther("1.2"),
            tokenSender: alice.address,
            nftRecipient: alice.address,
            swapData: swapData
        };
  
        
        await dittoPool.connect(alice).swapTokensForNfts(args);



        const upshotOracle: Contract = new Contract(
            oracleAddress,
            abiUpshotOracle,
            ethers.provider 
        );

        const value00: any = await upshotOracle.value00();
        console.log("value00: ", value00);
  


    });

});
