/* eslint-disable @typescript-eslint/no-unused-vars */

export const fetchToken = async ({ contract, tokenId }: { contract: string; tokenId: string }) => {
  return {
    contract,
    tokenId,
    collection: contract.toLowerCase(),
    slug: "bridge-to-base",
    name: `Bridge to Base ${tokenId}`,
    description:
      "Base is for everyone, everywhere. Bridge to Base to join us as the journey begins.\\n\\nThis NFT commemorates you being early — you’re one of the first to teleport into the next generation of the internet as we work to bring billions of people onchain.\\n\\nIt’s Onchain Summer and we’re excited to celebrate with you.",
    imageUrl:
      "https://lh3.googleusercontent.com/CsTRDND79fhWyy0icODaBNmUANFQlDPTmFekuJTkFV7U27BtsMtO-iabwbibkntLumFOSzWeJGCFXLNEw0lZH-ZU-WlID1jdVA",
    mediaUrl: null,
    attributes: [
      {
        key: "number",
        value: `${tokenId}`,
        kind: "number",
        rank: 1,
      },
      {
        key: "name",
        value: "Bridge to Base",
        kind: "string",
        rank: 1,
      },
    ],
  };
};
