import { Interface } from "ethers/lib/utils";
import { EventData } from ".";

// https://docs.opensea.io/docs/metadata-standards#metadata-updates
export const metadataUpdateOpensea: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-single-token-opensea",
  topic: "0xf8e1a15aba9398e019f0b49df1a4fde98ee17ae345cb5f6b5e2c27f5033e8ce7",
  numTopics: 1,
  abi: new Interface([`event MetadataUpdate(uint256 _tokenId)`]),
};

// https://docs.opensea.io/docs/metadata-standards#metadata-updates
export const batchMetadataUpdateOpensea: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-batch-tokens-opensea",
  topic: "0x6bd5c950a8d8df17f772f5af37cb3655737899cbf903264b9795592da439661c",
  numTopics: 1,
  abi: new Interface([`event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId)`]),
};

// https://docs.opensea.io/docs/metadata-standards#metadata-updates
export const metadataUpdateURIOpensea: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-uri-opensea",
  topic: "0x0e0d473f43a9d8727e62653cce4cd80d0c870ffb83dc4c93c9db4cb8ffe7053e",
  numTopics: 1,
  abi: new Interface([`event URI(string _value, uint256 indexed _id)`]),
};

// https://portal.thirdweb.com/contracts/ContractMetadata#contracturiupdated
export const contractURIUpdateThirdweb: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-contract-uri-thirdweb",
  topic: "0x3b9a9caad89c30f35f7d2f55a23b4ceaed9b54a64e2bff4fe2590f53308f94ec",
  numTopics: 1,
  abi: new Interface([`event ContractURIUpdated(string prevURI, string newURI)`]),
};

// https://github.com/ourzora/zora-721-contracts/blob/4ac79500c33553a16015db1e61b08865297b7e1e/src/metadata/DropMetadataRenderer.sol#L13
export const metadataUpdateURIZora: EventData = {
  kind: "metadata-update",
  subKind: "metadata-update-zora",
  topic: "0x0e0d473f43a9d8727e62653cce4cd80d0c870ffb83dc4c93c9db4cb8ffe7053e",
  numTopics: 1,
  abi: new Interface([
    `event MetadataUpdated(
        address indexed target,
        string metadataBase,
        string metadataExtension,
        string contractURI,
        uint256 freezeAt
    )`,
  ]),
};
