export type OrderParams = {
  // https://github.com/ourzora/v3/blob/main/contracts/modules/Asks/V1.1/AsksV1_1.sol#L117-L131
  tokenContract: string; // address
  tokenId: string; // uint256
  askPrice: string; // uint256
  askCurrency: string; // address
  sellerFundsRecipient: string; // address
  findersFeeBps: number; // uint16
};
