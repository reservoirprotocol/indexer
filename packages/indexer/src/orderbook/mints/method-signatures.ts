import { Interface, JsonFragmentType, Result, defaultAbiCoder } from "@ethersproject/abi";
import { guessAbiEncodedData } from "@openchainxyz/abi-guesser";
import axios from "axios";

import { idb } from "@/common/db";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";

export type MethodSignature = {
  signature: string;
  name?: string;
  params: string;
  decodedCalldata: Result;
  inputs: JsonFragmentType[];
};

const getInputsFromInterface = (iface: Interface): JsonFragmentType[] =>
  JSON.parse(iface.format("json") as string)[0].inputs;

export const getMethodSignature = async (
  calldata: string
): Promise<MethodSignature | undefined> => {
  const bytes4 = calldata.slice(0, 10);
  if (bytes4.length !== 10) {
    return undefined;
  }

  const results = await idb.manyOrNone(
    `
      SELECT
        method_signatures.name,
        method_signatures.params
      FROM method_signatures
      WHERE method_signatures.signature = $/bytes4/
    `,
    {
      bytes4: toBuffer(bytes4),
    }
  );

  const fetchFromOpenChain = async () => {
    const data = await axios
      .get(`https://api.openchain.xyz/signature-database/v1/lookup?function=${bytes4}&filter=true`)
      .then((response) => response.data);

    const matches = data?.result?.function?.[bytes4] ?? [];
    for (const match of matches) {
      if (!match.filtered) {
        // The `match.name` field has the format: `methodName(type0,type1,type2)`
        // Below we will simply separate the `methodName` and `type0,type1,type2`
        const i = match.name.indexOf("(");
        const name = match.name.slice(0, i).trim();
        const params = match.name.slice(i).slice(1, -1).trim();
        await saveMethodSignature(bytes4, name, params);

        results.push({ name, params });
      }
    }
  };

  // If no results are available then we try to get the details from openchain.xyz
  const openChainLockKey = `method-signature-oc-lock:${bytes4}`;
  const openChainLock = await redis.get(openChainLockKey);
  if (results.length === 0 && !openChainLock) {
    // When there are no signatures in our database, we make at most one call per hour
    await redis.set(openChainLockKey, "locked", "EX", 3600);
    await fetchFromOpenChain();
  } else if (!openChainLock) {
    // Otherwise we can make at most one call per day (to make sure we get new data)
    await redis.set(openChainLockKey, "locked", "EX", 24 * 3600);
    await fetchFromOpenChain();
  }

  // If multiple results are available then we will return the first matching one
  for (const { name, params } of results) {
    const iface = new Interface([`function ${name}(${params})`]);
    try {
      const decodedCalldata = iface.decodeFunctionData(name, calldata);
      return {
        signature: bytes4,
        name,
        params,
        decodedCalldata,
        inputs: getInputsFromInterface(iface),
      };
    } catch {
      // Skip errors
    }
  }

  // If no results were matched, then we try to reverse-engineer the calldata
  try {
    let paramTypes: string[] | null = null;

    const reverseEngineerCacheKey = `method-signature-re-cache:${bytes4}`;
    const reverseEngineerCache = await redis.get(reverseEngineerCacheKey);
    if (reverseEngineerCache) {
      paramTypes = JSON.parse(reverseEngineerCache) as string[];
    } else {
      const decodedParamTypes = guessAbiEncodedData(calldata);
      if (decodedParamTypes) {
        paramTypes = decodedParamTypes.map((pt) => pt.type);
        await redis.set(reverseEngineerCacheKey, JSON.stringify(paramTypes), "EX", 3600);
      }
    }

    if (paramTypes) {
      return {
        signature: bytes4,
        params: paramTypes.join(","),
        decodedCalldata: defaultAbiCoder.decode(paramTypes, "0x" + calldata.slice(10)),
        inputs: getInputsFromInterface(new Interface([`function guess(${paramTypes})`])),
      };
    }
  } catch {
    // Skip errors
  }
};

const saveMethodSignature = async (bytes4: string, name: string, params: string) =>
  idb.none(
    `
      INSERT INTO method_signatures (
        signature,
        name,
        params
      ) VALUES (
        $/signature/,
        $/name/,
        $/params/
      ) ON CONFLICT DO NOTHING
    `,
    {
      signature: toBuffer(bytes4),
      name,
      params,
    }
  );
