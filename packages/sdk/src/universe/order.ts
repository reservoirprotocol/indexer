import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { _TypedDataEncoder } from "@ethersproject/hash";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import { lc, n, s } from "../utils";

import { ethers, utils } from "ethers/lib";
import Erc721Abi from "../common/abis/Erc721.json";
import Erc20Abi from "../common/abis/Erc20.json";
import Erc1155Abi from "../common/abis/Erc1155.json";
import { encode, hashAssetType } from "./utils";

export class Order {
  public chainId: number;
  public params: Types.Order;

  constructor(chainId: number, params: Types.Order) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
    // Validate fees
    if (
      this.params.data.revenueSplits &&
      this.params.data.revenueSplits.length &&
      this.params.data.revenueSplits.reduce(
        (acc, curr) => (acc += Number(curr.value)),
        0
      ) > 10000
    ) {
      throw new Error("Invalid royalties");
    }

    if (this.params.start > this.params.end) {
      throw new Error("Invalid listing and/or expiration time");
    }
  }

  public hashOrderKey() {
    const encodedOrder = utils.defaultAbiCoder.encode(
      ["address", "bytes32", "bytes32", "uint256"],
      [
        lc(this.params.maker),
        hashAssetType(this.params.make.assetType),
        hashAssetType(this.params.take.assetType),
        this.params.salt,
      ]
    );

    return utils.keccak256(encodedOrder);
  }

  public async sign(signer: TypedDataSigner) {
    const signature = await signer._signTypedData(
      EIP712_DOMAIN(this.chainId),
      EIP712_TYPES,
      encode(this.params)
    );

    this.params = {
      ...this.params,
      signature,
    };
  }

  public getSignatureData() {
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types: EIP712_TYPES,
      value: toRawOrder(this),
    };
  }

  public checkSignature() {
    const signer = utils.verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      EIP712_TYPES,
      toRawOrder(this),
      this.params.signature!
    );

    if (lc(this.params.maker) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  public getInfo(): BaseOrderInfo | undefined {
    return this.getBuilder().getInfo(this);
  }

  public async checkFillability(provider: Provider) {
    let value = false;
    switch (this.params.make.assetType.assetClass) {
      case "ERC721":
        value = await this.verifyAllowanceERC721(provider);
        break;
      case "ERC20":
        value = await this.verifyAllowanceERC20(provider);
        break;
      case "ERC1155":
        value = await this.verifyAllowanceERC1155(provider);
        break;
      default:
        break;
    }
  }

  /**
   * This method verifies "allowance" of the walletAddress on a ERC1155 contract by calling
   * isApprovedForAll() and balanceOf() methods on the contract contractAddress to see if the
   * Marketplace contract is allowed to make transfers of tokenId on this contract and
   * that the walletAddress actually owns at least the amount of tokenId on this contract.
   * @param walletAddress
   * @param contractAddress
   * @param tokenId
   * @param amount
   * @returns {Promise<boolean>}
   */
  private async verifyAllowanceERC1155(provider: Provider): Promise<boolean> {
    let value = false;

    try {
      if (!utils.isAddress(this.params.make.assetType.contract!)) {
        throw new Error(`invalid-address`);
      }

      if (Number(this.params.make.value) <= 0) {
        throw new Error(`invalid-amount`);
      }

      if (isNaN(Number(this.params.make.assetType.tokenId))) {
        throw new Error("invalid-tokenId");
      }

      const erc1155Contract = new ethers.Contract(
        this.params.make.assetType.contract!,
        Erc1155Abi,
        provider
      );

      const isApprovedForAll = await erc1155Contract.isApprovedForAll(
        this.params.maker,
        Addresses.Exchange[this.chainId]
      );
      if (true !== isApprovedForAll) {
        throw new Error("no-approval");
      }

      const balance = await erc1155Contract.balanceOf(
        this.params.maker,
        this.params.make.assetType.tokenId
      );
      if (BigInt(this.params.make.value) > balance) {
        throw new Error("no-balance");
      }
      value = true;
    } catch (e) {
      value = false;
    }

    return value;
  }

  /**
   * This method verifies "allowance" of the walletAddress on a ERC20 contract by calling
   * allowance() and balanceOf() methods on the contract contractAddress to see if the
   * Marketplace contract is allowed to make transfers of tokens on this contract and
   * that the walletAddress actually owns at least the amount of tokens on this contract.
   * @param provider
   * @returns {Promise<boolean>}
   */
  private async verifyAllowanceERC20(provider: Provider): Promise<boolean> {
    let value = false;

    try {
      if (!utils.isAddress(this.params.make.assetType.contract!)) {
        throw new Error("invalid-address");
      }

      if (Number(this.params.make.value) <= 0) {
        throw new Error("invalid-amount");
      }

      const erc20Contract = new ethers.Contract(
        this.params.make.assetType.contract!,
        Erc20Abi,
        provider
      );

      const allowance = await erc20Contract.allowance(
        this.params.maker,
        Addresses.Exchange[this.chainId]
      );
      if (BigInt(this.params.make.value) > allowance) {
        throw new Error("no-balance");
      }

      const balance = await erc20Contract.balanceOf(this.params.maker);
      if (BigInt(this.params.make.value) > balance) {
        throw new Error(
          `Wallet  does not have enough balance of ${this.params.make.value}, got ${balance}`
        );
      }

      value = true;
    } catch (e) {
      value = false;
    }

    return value;
  }

  /**
   * This method verifies "allowance" of the walletAddress on the ERC721 contract
   * by calling isApprovedForAll(), getApproved() and ownerOf() on the contract to verify that
   * the Marketplace contract is approved to make transfers and the walletAddress actually owns
   * the token.
   * @returns {Promise<boolean>}
   */
  private async verifyAllowanceERC721(provider: Provider): Promise<boolean> {
    let value = false;

    try {
      if (!utils.isAddress(this.params.make.assetType.contract!)) {
        throw new Error(`Invalid contract address.`);
      }

      if (isNaN(Number(this.params.make.assetType.tokenId))) {
        throw new Error(`invalid-tokenId`);
      }

      const nftContract = new ethers.Contract(
        this.params.make.assetType.contract!,
        Erc721Abi,
        provider
      );

      const isApprovedForAll = await nftContract.isApprovedForAll(
        this.params.maker
      );

      if (!isApprovedForAll) {
        const approvedAddress = await nftContract.getApproved(
          this.params.make.assetType.tokenId
        );

        if (lc(approvedAddress) !== lc(Addresses.Exchange[this.chainId])) {
          throw new Error("no-approval");
        }
      }

      const owner = await nftContract.ownerOf(
        this.params.make.assetType.tokenId
      );
      if (lc(owner) !== lc(this.params.maker)) {
        throw new Error(`not-owner`);
      }

      value = true; //true if successfully reached this line.
    } catch (e) {
      value = false;
    }

    return value;
  }

  public buildMatching(taker: string, data?: any) {
    return this.getBuilder().buildMatching(this.params, taker, data);
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "single-token": {
        return new Builders.SingleToken(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  private detectKind(): Types.Order["kind"] {
    // single-token
    {
      const builder = new Builders.SingleToken(this.chainId);
      if (builder.isValid(this)) {
        return "single-token";
      }
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "Exchange",
  version: "2",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const EIP712_TYPES = {
  AssetType: [
    { name: "assetClass", type: "bytes4" },
    { name: "data", type: "bytes" },
  ],
  Asset: [
    { name: "assetType", type: "AssetType" },
    { name: "value", type: "uint256" },
  ],
  Order: [
    { name: "maker", type: "address" },
    { name: "makeAsset", type: "Asset" },
    { name: "taker", type: "address" },
    { name: "takeAsset", type: "Asset" },
    { name: "salt", type: "uint256" },
    { name: "start", type: "uint256" },
    { name: "end", type: "uint256" },
    { name: "dataType", type: "bytes4" },
    { name: "data", type: "bytes" },
  ],
};

const toRawOrder = (order: Order): any =>
  encode({
    ...order.params,
  });

const normalize = (order: Types.Order): Types.Order => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    type: order.type,
    maker: lc(order.maker),
    make: {
      assetType: {
        assetClass: s(order.make.assetType.assetClass),
        ...(order.make.assetType.tokenId && {
          tokenId: order.make.assetType.tokenId,
        }),
        ...(order.make.assetType.contract && {
          contract: lc(order.make.assetType.contract),
        }),
      },
      value: s(order.make.value),
    },
    taker: lc(order.taker),
    take: {
      assetType: {
        assetClass: s(order.take.assetType.assetClass),
        ...(order.take.assetType.tokenId && {
          tokenId: order.take.assetType.tokenId,
        }),
        ...(order.take.assetType.contract && {
          contract: lc(order.take.assetType.contract),
        }),
      },
      value: s(order.take.value),
    },
    salt: s(order.salt),
    start: n(order.start),
    end: n(order.end),
    data: {
      dataType: order.data.dataType,
      revenueSplits:
        !order.data.revenueSplits || !order.data.revenueSplits.length
          ? []
          : order.data.revenueSplits.map((split) => ({
              account: lc(split.account),
              value: n(split.value),
            })),
    },
    signature: order.signature,
  };
};
