export enum CheckType {
  ERC721_TOKEN_BALANCE,
  ERC721_TOKEN_ID_OWNERSHIP,
  ERC1155_TOKEN_ID_BALANCE,
}

export type Request = {
  maker: string;
  solver: string;
  currency: string;
  price: string;
  checkType: CheckType;
  checkData: string;
  originChainId: number;
  destinationChainId: number;
  deadline: number;
  salt: number;
  signature?: string;
};
