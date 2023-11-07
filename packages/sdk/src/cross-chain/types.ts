export type Request = {
  isCollectionRequest: boolean;
  maker: string;
  solver: string;
  token: string;
  tokenId: string;
  amount: string;
  price: string;
  recipient: string;
  chainId: number;
  deadline: number;
  salt: string;
  signature?: string;
};
