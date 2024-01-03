import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { MetadataApi } from "@/utils/metadata-api"

describe("Try metadata-api", () => {
  // zkfair tokens
  it("getCollectionMetadata", async () => {
    const contract = '0x84410CBfd1e48F4DF8bDdD4931Cb27c022F45E6e';
    const tokenId = '2039';
    const res = await MetadataApi.getTokensMetadata([{ contract, tokenId }]);
    console.log(`inspect result: ${JSON.stringify(res, null, 3)}`);
  });

  // it("getCollectionMetadata", async () => {
  //   const contract = '0x84410CBfd1e48F4DF8bDdD4931Cb27c022F45E6e';
  //   const tokenId = '3886';
  //   const res = await MetadataApi.getCollectionMetadata(contract, tokenId, "")
  //   console.log(`inspect result: ${JSON.stringify(res, null, 3)}`)
  // });
});
