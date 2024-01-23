export interface MintConfig {
  maxSupply?: number; // max supply for the collection
  maxMintsPerWallet?: number; // max mint per wallet for the collection
  maxMintsPerTransaction?: number; // max mint per transaction for all phases
  phases: MintPhase[]; // the mint phases
}

export interface MintPhase {
  maxMintsPerWallet?: number; // limit of mint per wallet for this phase
  maxMintsPerTransaction?: number; // max mint per transaction for this phases
  startTime: number | ContractCall; // timestamp, in seconds, for start mint phase
  endTime: number | ContractCall; // timestamp, in seconds, for end mint phase
  price?: string | ContractCall; // in wei
  currency?: string; // contract address, undefined or address(0) if native
  tx: TxBuild; // the data to build the transaction to mint
  tokenId?: string; // the token id if ERC1155
}

export interface ContractCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any;
  functionName: string;
  to?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputs?: any[];
}

export interface TxBuild {
  to?: string; // what contract to call. if undefined, current collection. if defined, must satisfy the regex /0x[a-fA-F0-9]{40}/
  method: string; // method signature, must satisfy the regex: /0x[a-f0-9]{8}/
  params?: TxParam[]; // the params to build the transaction
}

export interface TxParam {
  name: string; // name of the param, to display to the users if needed
  abiType: string; // abi type to encode it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any; // value for that parameter. type must satisfy "abiType". if set, kind and values are ignored.
  kind?: string; // keyword for some kind of params
  values?: TxParamValues; // the possible values.
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TxParamValues = { [k: string]: any } | TxParamValuesOption[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TxParamValuesOption = { label: string; value: any }; // value type must satisfy the abiType for that TxParam

export type BuilderConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;
  collection: string;
};
