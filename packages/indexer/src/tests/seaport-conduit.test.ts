import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { getConduits, updateConduitChannel } from "../utils/seaport-conduit";

import { describe, it, expect } from "@jest/globals";

describe("Seaport Conduit", () => {
  it("save-conduit", async () => {
    const conduit = `0xc1167130d6a3D589dDD08c20AD69b480B30C4fbC`.toLowerCase();
    const conduitKey =
      `0xF984C55CA75735630C1C27D3D06969C1AA6AF1DF86D22DDC0E3A978AD6138E9F`.toLowerCase();
    await updateConduitChannel(conduit);
    const result = await getConduits([conduitKey]);
    expect(result.find((c) => c.conduitKey === conduitKey)).not.toBe(undefined);
  });

  it("import-conduits", async () => {
    const conduits = [
      {
        conduit: "0x4a49e91a45Cb6cc4E083e86eD3A6d95fe7384461",
        conduitKey: "0x263C993863204130DADFAF0D8926FF32EA52DAE289469D60BF61720DCB9E4821",
      },
      {
        conduit: "0x9352dA82F42c5bDDe9F0b2C19D635baE39142dD8",
        conduitKey: "0xA8C94AE38B04140794A9394B76AC6D0A83AC0B02000000000000000000000000",
      },
      {
        conduit: "0xc1167130d6a3D589dDD08c20AD69b480B30C4fbC",
        conduitKey: "0xF984C55CA75735630C1C27D3D06969C1AA6AF1DF86D22DDC0E3A978AD6138E9F",
      },
      {
        conduit: "0xd6Dfb8Fb4d117Dbf9d83e8d57BdA2d67c8CD4488",
        conduitKey: "0x31E9CC5FAA2CA95DD3EA25C7A6A14E30C02D139F000000000000000000000000",
      },
      {
        conduit: "0xcDEa48d73057d25Cf80EA13d9866907Df2f40dc4",
        conduitKey: "0xB9F312A053A074BC69BBAE4CAA423D74B1301CC6000000000000000000000000",
      },
      {
        conduit: "0x961e5c5604984628Be546251438f4663697d60c1",
        conduitKey: "0xF94C9667295756F034D20382589E89C120204109000000000000000000001000",
      },
      {
        conduit: "0xFbf166299d3C012de9efeC0240D12756C1f4c0Fc",
        conduitKey: "0xF3D63166F0CA56C3C1A3508FCE03FF0CF3FB691E000000000000000000000000",
      },
      {
        conduit: "0x7897018b1cE161e58943C579AC3df50d89c3D4F4",
        conduitKey: "0x530387DBF7F794E3C32F5E033DBFC682F1952131000000000000000000000000",
      },
      {
        conduit: "0x48875A3257FE0ff080CECcfF957023ca7253A5f8",
        conduitKey: "0x6474AB64045BF9B341812B42CBD1E09122B758FF000000000000000000000000",
      },
    ];

    for (const { conduit, conduitKey } of conduits) {
      await updateConduitChannel(conduit);
      const result = await getConduits([conduitKey.toLowerCase()]);
      expect(result.find((c) => c.conduitKey === conduitKey.toLowerCase())).not.toBe(undefined);
    }
  });
});
