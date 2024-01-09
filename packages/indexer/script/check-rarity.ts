import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { config } from "@/config/index";
import { Rarity } from "@/utils/rarity";

const main = async () => {
  console.log(`==config: ${JSON.stringify(config, null, 3)}`);

  const collectionId = "0x48018a45a18a08a9616576f50fbff7eeb5ddb974";
  const tokensRarity = await Rarity.getCollectionTokensRarity(collectionId);

  console.log(`==tokensRarity: ${JSON.stringify(tokensRarity, null, 3)}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
