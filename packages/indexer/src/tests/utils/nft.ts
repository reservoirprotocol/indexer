import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { logger } from "@/common/logger";
import { wait } from "./test";

export async function setupNFTs(
  nft: Contract,
  seller: Wallet,
  taker: Wallet,
  tokenId: number,
  operator: string
) {
  const tokenOwner = await nft.ownerOf(tokenId);

  logger.info(
    "setupNFTs",
    JSON.stringify({
      tokenOwner,
      taker: taker.address,
      seller: seller.address,
    })
  );

  // send back to seller
  if (tokenOwner == taker.address) {
    const backTx = await nft.connect(taker).transferFrom(taker.address, seller.address, tokenId);
    logger.info("setupNFTs", `send token back ${backTx.hash}`);
    await backTx.wait();
    await wait(120 * 1000);
  } else {
    logger.info("setupNFTs", "no token back");
  }

  const isApproved = await nft.isApprovedForAll(seller.address, operator);

  // approve
  if (!isApproved) {
    const approveTx = await nft.setApprovalForAll(operator, true);
    await approveTx.wait();
  }
}

export async function setupERC1155NFTs(
  nft: Contract,
  seller: Wallet,
  taker: Wallet,
  tokenId: number,
  operator: string
) {
  const [sellerTokenAmount, takerTokenAmount] = await Promise.all([
    nft.balanceOf(seller.address, tokenId),
    nft.balanceOf(taker.address, tokenId),
  ]);

  logger.info(
    "setupERC1155NFTs",
    `balance ${JSON.stringify({
      sellerTokenAmount: sellerTokenAmount.toString(),
      takerTokenAmount: takerTokenAmount.toString(),
    })}`
  );

  const sellerEmpty = sellerTokenAmount.toString() === "0";
  const takerEmpty = takerTokenAmount.toString() === "0";
  const takerNotEmpty = takerTokenAmount.toString() !== "0";

  if (sellerEmpty && takerEmpty) {
    logger.info("setupERC1155NFTs", `mint token`);
    await nft.connect(seller).mint(tokenId);
  }

  if (sellerEmpty && takerNotEmpty) {
    const backTx = await nft
      .connect(taker)
      .safeTransferFrom(taker.address, seller.address, tokenId, takerTokenAmount.toString(), "0x");
    logger.info("setupERC1155NFTs", `send token back ${backTx.hash}`);
    await backTx.wait();
    await wait(120 * 1000);
  }

  const afterBalance = await nft.balanceOf(seller.address, tokenId);

  logger.info("setupERC1155NFTs", `afterBalance=${afterBalance}`);

  const isApproved = await nft.isApprovedForAll(seller.address, operator);

  if (!isApproved) {
    const approveTx = await nft.setApprovalForAll(operator, true);
    logger.info("setupERC1155NFTs", `approve token ${approveTx.hash}`);
    await approveTx.wait();
  }
}
