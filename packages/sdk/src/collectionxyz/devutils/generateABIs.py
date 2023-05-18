# pylint: disable=invalid-name
"""
This script will copy relevant ABIs from a local copy of the collectionswap
public repo. This assumes that the collectionswap repo resides in a directory
named "collectionswap" at the same level as "indexerDirectoryName", the base
directory of this repo.
"""
from pathlib import Path
import json

indexerDirectoryName = "indexer"

# Add additional ABIs which are needed by the SDK but not deployed explicitly
# here (e.g. interfaces)
additionalABIs = ["ICollectionPool", "CollectionPool"]

# Get the list of contracts deployed
relevantContracts = set()
for abiName in additionalABIs:
    relevantContracts.add(abiName)
with open("deploys.json", "r", encoding="utf-8") as fd:
    js = json.load(fd)
    contracts = js["Ethereum"]
    for contractName in contracts:
        relevantContracts.add(contractName)

# Find the directory containing compilation artifacts from hardhat in
# collectionswap repo
path = Path().absolute()
while path.name != indexerDirectoryName:
    path = path.parent
collectionRepoPath = (
    path.parent.joinpath("collectionswap-internal")
    .joinpath("artifacts")
    .joinpath("contracts")
)

# Iterate over all the json files only, ignore dbg.jsons. If the filename
# matches a desired contract name, extract the `abi` component and write to
# output directory in its own file
outputPathRoot = Path().absolute().parent.joinpath("abis")
for x in collectionRepoPath.glob("**/*.json"):
    if "dbg.json" in str(x):
        continue

    if x.stem in relevantContracts:
        with open(x, "r", encoding="utf-8") as fd:
            abi = json.load(fd)["abi"]
            with open(
                outputPathRoot.joinpath(x.stem + x.suffix),
                "w",
                encoding="utf-8",
            ) as outFd:
                json.dump(abi, outFd, indent=2)
                outFd.write("\n")
