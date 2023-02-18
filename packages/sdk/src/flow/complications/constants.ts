export const ORDER_EIP712_TYPES = {
  Order: [
    { name: "isSellOrder", type: "bool" },
    { name: "signer", type: "address" },
    { name: "constraints", type: "uint256[]" },
    { name: "nfts", type: "OrderItem[]" },
    { name: "execParams", type: "address[]" },
    { name: "extraParams", type: "bytes" },
  ],
  OrderItem: [
    { name: "collection", type: "address" },
    { name: "tokens", type: "TokenInfo[]" },
  ],
  TokenInfo: [
    { name: "tokenId", type: "uint256" },
    { name: "numTokens", type: "uint256" },
  ],
};
