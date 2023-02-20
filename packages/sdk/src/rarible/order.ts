import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { _TypedDataEncoder } from "@ethersproject/hash";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import { lc, n, s } from "../utils";

import { BigNumber, constants, ethers, utils } from "ethers/lib";
import Erc721Abi from "../common/abis/Erc721.json";
import Erc20Abi from "../common/abis/Erc20.json";
import Erc1155Abi from "../common/abis/Erc1155.json";
import { encodeForMatchOrders, encodeOrderData, hashAssetType } from "./utils";
import { ORDER_DATA_TYPES } from "./constants";

export class Order {
  public chainId: number;
  public params: Types.Order;

  constructor(chainId: number, params: Types.Order) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch (err) {
      console.log(err);
      throw new Error("Invalid params");
    }

    if (this.params.start > this.params.end) {
      throw new Error("Invalid listing and/or expiration time");
    }
  }

  public hashOrderKey() {
    let encodedOrderKey = null;

    switch (this.params.data.dataType) {
      case ORDER_DATA_TYPES.V1:
      case ORDER_DATA_TYPES.DEFAULT_DATA_TYPE:
        encodedOrderKey = utils.defaultAbiCoder.encode(
          ["address", "bytes32", "bytes32", "uint256"],
          [
            lc(this.params.maker),
            hashAssetType(this.params.make.assetType),
            hashAssetType(this.params.take.assetType),
            this.params.salt,
          ]
        );
        break;
      default:
        encodedOrderKey = utils.defaultAbiCoder.encode(
          ["address", "bytes32", "bytes32", "uint256", "bytes"],
          [
            lc(this.params.maker),
            hashAssetType(this.params.make.assetType),
            hashAssetType(this.params.take.assetType),
            this.params.salt,
            encodeOrderData(this.params),
          ]
        );
        break;
    }

    return utils.keccak256(encodedOrderKey);
  }

  private EIP712_DOMAIN = (chainId: number) => ({
    name: "Exchange",
    version: "2",
    chainId,
    verifyingContract: Addresses.Exchange[chainId],
  });

  public async sign(signer: TypedDataSigner) {
    const signature = await signer._signTypedData(
      this.EIP712_DOMAIN(this.chainId),
      Types.EIP712_TYPES,
      toRawOrder(this)
    );

    this.params = {
      ...this.params,
      signature,
    };
  }

  public getSignatureData() {
    return {
      signatureKind: "eip712",
      domain: this.EIP712_DOMAIN(this.chainId),
      types: Types.EIP712_TYPES,
      value: toRawOrder(this),
    };
  }

  public checkSignature() {
    const signer = utils.verifyTypedData(
      this.EIP712_DOMAIN(this.chainId),
      Types.EIP712_TYPES,
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

      case "contract-wide": {
        return new Builders.ContractWide(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  private detectKind(): Types.OrderKind {
    // single-token
    const singleTokenBuilder = new Builders.SingleToken(this.chainId);
    if (singleTokenBuilder.isValid(this)) {
      return "single-token";
    }

    const contractBuilder = new Builders.ContractWide(this.chainId);
    if (contractBuilder.isValid(this)) {
      return "contract-wide";
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }
}

const toRawOrder = (order: Order): any => {
  const encoded = encodeForMatchOrders(order.params);
  return encoded;
};

const normalize = (order: Types.Order): Types.Order => {
  // Perform some normalization operations on the order:
  // - parse Rarible API order format
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  let dataInfo:
    | Types.ILegacyOrderData
    | Types.IV1OrderData
    | Types.IV2OrderData
    | Types.IV3OrderSellData
    | Types.IV3OrderBuyData
    | null = null;

  order.data.dataType =
    order.data.dataType || (order.data["@type"] as ORDER_DATA_TYPES) || "";

  switch (order.data.dataType) {
    case ORDER_DATA_TYPES.LEGACY:
    case ORDER_DATA_TYPES.V1:
    case ORDER_DATA_TYPES.API_V1:
      order.data.dataType = ORDER_DATA_TYPES.V1;

      dataInfo = order.data;
      break;
    case ORDER_DATA_TYPES.V2:
    case ORDER_DATA_TYPES.API_V2:
      order.data.dataType = ORDER_DATA_TYPES.V2;

      dataInfo = order.data as Types.IV2OrderData;
      if (dataInfo.originFees) {
        dataInfo.originFees = dataInfo.originFees.map((fee) =>
          normalizePartData(fee)
        );
      }
      if (dataInfo.payouts) {
        dataInfo.payouts = dataInfo.payouts.map((fee) =>
          normalizePartData(fee)
        );
      }

      break;
    case ORDER_DATA_TYPES.V3_SELL:
    case ORDER_DATA_TYPES.API_V3_SELL:
      dataInfo = order.data as Types.IV3OrderSellData;
      order.data.dataType = ORDER_DATA_TYPES.V3_SELL;

      if (dataInfo.originFeeFirst) {
        dataInfo.originFeeFirst = normalizePartData(dataInfo.originFeeFirst);
      }

      if (dataInfo.originFeeSecond) {
        dataInfo.originFeeSecond = normalizePartData(dataInfo.originFeeSecond);
      }

      if (dataInfo.payouts) {
        dataInfo.payouts = normalizePartData(dataInfo.payouts);
      }

      break;
    case ORDER_DATA_TYPES.V3_BUY:
    case ORDER_DATA_TYPES.API_V3_BUY:
      dataInfo = order.data as Types.IV3OrderBuyData;
      order.data.dataType = ORDER_DATA_TYPES.V3_BUY;

      if (dataInfo.originFeeFirst) {
        dataInfo.originFeeFirst = normalizePartData(dataInfo.originFeeFirst);
      }

      if (dataInfo.originFeeSecond) {
        dataInfo.originFeeSecond = normalizePartData(dataInfo.originFeeSecond);
      }

      if (dataInfo.payouts) {
        dataInfo.payouts = normalizePartData(dataInfo.payouts);
      }

      break;
    default:
      throw Error("Unknown rarible order data type");
  }
  var {
    assetClass: makeAssetClass,
    tokenId: makeTokenId,
    contract: makeContract,
    value: makeValue,
    lazyMintInfo: makeLazyMintInfo,
  } = parseAssetData(order.make);
  var {
    assetClass: takeAssetClass,
    tokenId: takeTokenId,
    contract: takeContract,
    value: takeValue,
    lazyMintInfo: takeLazyMintInfo,
  } = parseAssetData(order.take);

  const maker = extractAddressFromChain(order.maker);
  const taker = extractAddressFromChain(order.taker || constants.AddressZero);
  const hash = extractAddressFromChain(order.hash || order.id || "");

  const tokenKind = takeAssetClass.toLowerCase().includes("collection")
    ? "contract-wide"
    : "single-token";

  const side = tokenKind === "contract-wide" || takeTokenId ? "buy" : "sell";
  const salt = order.salt;
  const start = n(order.start) || 0;
  const end =
    Math.floor(new Date(order.endedAt || "").getTime() / 1000) ||
    n(order.end) ||
    0;

  return {
    kind: tokenKind,
    side: side,
    signature: order.signature,
    type: order.type || "RARIBLE",
    maker: lc(maker),
    hash: hash,
    make: {
      assetType: {
        assetClass: s(makeAssetClass),
        ...(makeTokenId && {
          tokenId: makeTokenId,
        }),
        ...(makeContract && {
          contract: lc(makeContract),
        }),
        ...makeLazyMintInfo,
      },
      value: s(makeValue),
    },
    taker: lc(taker),
    take: {
      assetType: {
        assetClass: s(takeAssetClass),
        ...(takeTokenId && {
          tokenId: takeTokenId,
        }),
        ...(takeContract && {
          contract: lc(takeContract),
        }),
        ...takeLazyMintInfo,
      },
      value: s(takeValue),
    },
    salt,
    start,
    end,
    data: dataInfo,
  };
};

function extractAddressFromChain(address: string) {
  if (!address) {
    return "";
  }

  const addressHasChainInfo = address.indexOf(":") >= 0;
  const parsedAddress = addressHasChainInfo ? address.split(":")[1] : address;
  return parsedAddress;
}

function parseAssetData(assetInfo: Types.LocalAsset) {
  let assetClass = (
    assetInfo.assetType?.assetClass ||
    assetInfo.type["@type"] ||
    ""
  ).toUpperCase();

  const contract = extractAddressFromChain(
    assetInfo.assetType?.contract || (assetInfo as any)?.type?.contract || ""
  );

  const tokenId =
    assetInfo.assetType?.tokenId || (assetInfo as any)?.type?.tokenId || "";

  const valueIsDecimal = assetInfo.value.includes(".");
  // It's safe to assume for now that 18 will work
  const value = valueIsDecimal
    ? utils.parseEther(assetInfo.value)
    : assetInfo.value;

  const lazyMintInfo = {
    ...((assetInfo.assetType?.uri || assetInfo.type?.uri) && {
      uri: assetInfo.assetType?.uri || assetInfo.type?.uri,
    }),
    ...((assetInfo.assetType?.supply || assetInfo.type?.supply) && {
      supply: assetInfo.assetType?.supply || assetInfo.type?.supply,
    }),
    ...((assetInfo.assetType?.creators || assetInfo.type?.creators) && {
      creators: (assetInfo.assetType?.creators || assetInfo.type?.creators).map(
        (l: Types.IPart) => normalizePartData(l)
      ),
    }),
    ...((assetInfo.assetType?.royalties || assetInfo.type?.royalties) && {
      royalties: (
        assetInfo.assetType?.royalties || assetInfo.type?.royalties
      ).map((l: Types.IPart) => normalizePartData(l)),
    }),
    ...((assetInfo.assetType?.signatures || assetInfo.type?.signatures) && {
      signatures: (
        assetInfo.assetType?.signatures || assetInfo.type?.signatures
      ).map((l: string) => extractAddressFromChain(l)),
    }),
  };

  return { assetClass, tokenId, contract, value, lazyMintInfo };
}

function normalizePartData(fee: Types.IPart) {
  const address = extractAddressFromChain(fee.account);
  return { ...fee, account: lc(address) };
}
