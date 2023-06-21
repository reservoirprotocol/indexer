import { Contract } from "@ethersproject/contracts";
import * as Sdk from "../../../../sdk/src";


import { ethers } from "hardhat";

//import { ethers } from 'ethers';

import FactoryAbi from "../../../../sdk/src/ditto/abis/Factory.json";


export const setupDittoPool = async () => {

    const chainId = 5; //TODO: getChainId() after mainnet deploy

    const lol = Sdk.Ditto.Addresses.PoolFactory[chainId];

    console.log("chainId: ", lol);

    const factory = new Contract(
        Sdk.Ditto.Addresses.PoolFactory[chainId],
        FactoryAbi,
        ethers.provider 
      );
  
    return factory;
};



// export const setupDittoListings = async (listings: DittoListing[]) => {
//   const chainId = getChainId();

//   const factory = new Contract(
//     Sdk.Ditto.Addresses.PoolFactory[chainId],
//     FactoryAbi,
//     ethers.provider
//   );
//   for (const listing of listings) {
//     const { seller, nft, price, isCancelled } = listing;

//     // Approve the factory contract
//     await nft.contract.connect(seller).mint(nft.id);
//     await nft.contract
//       .connect(seller)
//       .setApprovalForAll(Sdk.Ditto.Addresses.PoolFactory[chainId], true);

//     /*  
//     // Get the pair address by making a static call to the deploy method
//     const pair = await factory.connect(seller).callStatic.createDittoPool( //returns (IDittoPool dittoPool, uint256 lpId, IPoolManager poolManager, IPermitter permitter)
//       nft.contract.address,
//       Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
//       seller.address,
//       1, // NFT
//       0,
//       0,
//       price,
//       AddressZero,
//       isCancelled ? [] : [nft.id]
//     );
//     */







//     // struct PoolTemplate {
//     //     address token; // ERC20 token address
//     //     address nft; // the address of the NFT collection that we are creating a pool for
//     //     uint96 feeLp; // set by owner, paid to LPers only when they are the counterparty in a trade
//     //     address owner; // owner creating the pool
//     //     uint96 feeAdmin; // set by owner, paid to admin fee recipient
//     //     uint128 delta; // the delta of the pool, see bonding curve documentation
//     //     uint128 basePrice; // the base price of the pool, see bonding curve documentation
//     //     uint256[] nftIdList; // the token IDs of NFTs to deposit into the pool
//     //     uint256 initialTokenBalance; // the number of ERC20 tokens to transfer to the pool
//     //     bytes templateInitData; // initial data to pass to the pool contract in its initializer
//     //     bytes referrer; // the address of the referrer
//     // }
    
//     // struct PoolManagerTemplate {
//     //     uint256 templateIndex;
//     //     bytes templateInitData;
//     // }
    
//     // struct PermitterTemplate {
//     //     uint256 templateIndex;
//     //     bytes templateInitData;
//     //     bytes liquidityDepositPermissionData;
//     // }


//     const poolTemplate = [
//         false, //bool isPrivatePool
//         0, //uint256 templateIndex
//     ];






//     // Actually deploy the pair
//     await factory.connect(seller).createDittoPool(
//         // PoolTemplate memory poolTemplate_,
//         // PoolManagerTemplate calldata poolManagerTemplate_,
//         // PermitterTemplate calldata permitterTemplate_
//       nft.contract.address,
//       Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
//       seller.address,
//       1, // NFT
//       0,
//       0,
//       price,
//       AddressZero,
//       isCancelled ? [] : [nft.id]
//     );

//     listing.order = new Sdk.SudoswapV2.Order(chainId, {
//       pair,
//       extra: {
//         prices: [price.toString()],
//       },
//     });
//   }
// };