export type Request = {
  maker: string;
  solver: string;
  currency: string;
  price: string;
  originChainId: number;
  destinationChainId: number;
  deadline: number;
  salt: number;
  zoneAndValueAndData: string;
  signature?: string;
};
