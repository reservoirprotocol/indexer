import {
  Provider,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { TxData } from "../utils";

import ProxyRegistryAbi from "./abis/ProxyRegistry.json";

/**
 * The ProxyRegistry interface provides partial functionality to interact with the Wyvern Proxy Registry contract.
 */
export class ProxyRegistry {
  /**
   * The proxy registry's Ethereum contract object
   */
  public contract: Contract;

  /**
   *
   * @param provider A read-only abstraction to access the blockchain data
   * @param chainId The chain ID for the Ethereum network to be used. For example, 1 for Ethereum Mainnet and 4 for Rinkeby Testnet.
   */
  constructor(provider: Provider, chainId: number) {
    this.contract = new Contract(
      Addresses.ProxyRegistry[chainId],
      ProxyRegistryAbi as any,
      provider
    );
  }

  /**
   *
   * @param owner Proxy owner's address
   * @returns The proxy's Ethereum address
   */
  public async getProxy(owner: string): Promise<string> {
    return this.contract.proxies(owner);
  }

  /**
   * Register an Ethereum address to the Wyvern Proxy Registry contract
   * @param registerer Registerer to the Proxy Registry contract
   * @returns The contract transaction
   */
  public async registerProxy(registerer: Signer): Promise<TransactionResponse> {
    return this.contract.connect(registerer).registerProxy();
  }

  public registerProxyTransaction(registerer: string): TxData {
    const data = this.contract.interface.encodeFunctionData("registerProxy");
    return {
      from: registerer,
      to: this.contract.address,
      data,
    };
  }
}
