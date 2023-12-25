import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { config } from "@/config/index";
// import { keccak256 } from "ethers/lib/utils";

describe("Try config", () => {
  it("testing", async () => {
    // console.log(`inspect config: ${JSON.stringify(config, null, 3)}`)
    expect(config.version).toBe("v5")
  });
});
