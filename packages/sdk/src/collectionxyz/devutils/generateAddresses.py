# pylint: disable=invalid-name
"""
Script for parsing deployed addresses from collectionswap repo output format to
a TS file which fits the format required of addresses.ts
"""
import json

data = {}

with open("deploys.json", "r", encoding="utf-8") as fd:
    js = json.load(fd)
    for networkName in js:
        network = js[networkName]
        for contractName in network:
            contractAddress = network[contractName].lower()
            obj = data.get(contractName, {})
            obj[networkName] = contractAddress
            data[contractName] = obj

# Now format the json as typescript
outputTokens = []

for contractName, addressBook in data.items():
    chainIdToAddressTokens = []
    for networkName, contractAddress in addressBook.items():
        chainIdToAddressTokens.append(
            f"""  [Network.{networkName}]: "{contractAddress}",\n"""
        )

    outputTokens.append(
        f"""export const {contractName}: ChainIdToAddress = {{
{"".join(chainIdToAddressTokens)}}};"""
    )


outputTokens.insert(0, """import { ChainIdToAddress, Network } from "../utils";""")

output = "\n\n".join(outputTokens) + "\n"

with open("../addresses.ts", "w", encoding="utf-8") as fd:
    fd.write(output)
