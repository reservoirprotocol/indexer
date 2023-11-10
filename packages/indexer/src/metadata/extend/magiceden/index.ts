/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { CollectionMetadata } from "@/metadata/types";
export const extendCollection = async (metadata: CollectionMetadata, _tokenId = null) => {
  const metadataOverride: Record<string, any> = {
    "0xef41141fbc0a7c870f30fee81c6214582dc2a494": {
      metadata: {
        twitterUrl: "https://twitter.com/playwildcard",
      },
    },
    "0x72106bbe2b447ecb9b52370ddc63cfa8e553b08c": {
      name: "ORL Ocean Racers",
    },
    "0x71ef0488d78ed490c8ffa3112fb3d7b4614f76b5": {
      name: "Ocean Racing Coaches Association",
      metadata: {
        description:
          "ORCA member coaches are specially trained to work with compatible ORL Ocean Racers. Season 1 consists of 505 Coaches, living on the Polygon Blockchain. Appointing the right coach to your team will take your racers to new levels of performance that are otherwise unattainable. The impact your coach has is determined by 3 key factors; Coach Class, Specialties and Prestige.",
        discordUrl: "https://discord.gg/ocean-racing-league",
        externalUrl: "https://oceanracingleague.com",
      },
    },
    "0xb58e69929d5d4d2a2a2e119b0d2bf3ee23ebfff0": {
      metadata: {
        description:
          "Official collection of the PsychoKitties characters. Previously on Crypto.com ($13.4M+ traded): https://crypto.com/nft/collection/faa3d8da88f9ee2f25267e895db71471",
        twitterUrl: "https://www.twitter.com/psychokittiesog",
        discordUrl: "https://discord.gg/quantumfrenzy",
        externalUrl: "https://www.psychokitties.io",
      },
    },
    "0xec2b044db5f04dd2bed8f0ff2f82b1719ff64b2a": {
      metadata: {
        description:
          "The lovely offspring of PsychoKitties, PsychoMollies and Mad Hares from the first ever cross-project breeding event in the world (August 19 - August 27, 2022).",
        twitterUrl: "https://twitter.com/madharesociety",
        discordUrl: "https://discord.gg/quantumfrenzy",
        externalUrl: "https://www.madharesociety.com",
      },
    },
    "0x5456a0343308a6fd106334f06fdf57a2f4dcc892": {
      metadata: {
        description:
          "Own a piece of PsychoKitties x Mad Hare Society lore history and join us on a wild adventure across time & space to unlock special surprises. Interactive comic platform opening soon!",
        twitterUrl: "https://twitter.com/quantumfrenzy",
        discordUrl: "https://discord.gg/quantumfrenzy",
        externalUrl: "https://www.quantumfrenzy.com",
      },
    },
    "0xadeac691a3762793aefcbfe22761614d229feaa2": {
      name: "Degen Mercenaries",
      metadata: {
        description: "PvP shootout duel game on Polygon. S2E $MATIC instantly!",
        twitterUrl: "https://twitter.com/degenmercsnft",
        discordUrl: "https://discord.com/invite/degenmercenaries",
        externalUrl: "https://www.degenmercenaries.com",
      },
      royalties: [
        {
          recipient: "0xaa6a43b1e4cd5229e2ee3c6a52c086d2f6b2b325",
          bps: 455,
        },
        {
          recipient: "0x1eca4dd8ecb97b45054c81438f6f49d18ce4f343",
          bps: 45,
        },
      ],
    },
    "0x09421f533497331e1075fdca2a16e9ce3f52312b": {
      name: "HellCats",
      metadata: {
        description: "HellCats are a collection of 2,500 michevious Troublemakers, on Polygon.",
        imageUrl:
          "https://bafkreiewsgu4z26dtgfes4hoxbp4rqkgwlhnzjhbnlksuwjwj65eiuuvom.ipfs.nftstorage.link",
        twitterUrl: "https://twitter.com/HellCatsNFT",
      },
      royalties: [],
    },
    "0x8efa4df13705422626733751f7f3927283f0ee8e": {
      metadata: {
        description:
          "In the realm of the digital world, where creativity and innovation converge, a new chapter is about to unfold. Behold, the grand tale of Valiant Vikings, an extraordinary NFT collection that brings to life the epic saga of fearless warriors, mythical creatures, and untamed lands....",
        imageUrl:
          "https://bafybeidsrz5usezfxp3d7pgmmokmmne4clwpqv3wxlrqy3vmfr576mhzge.ipfs.nftstorage.link",
        twitterUrl: "https://twitter.com/Valiantvikin",
        discordUrl: "https://discord.gg/Bx2Drr2t4f",
        externalUrl: "https://www.purplewavestudios.com",
      },
      royalties: [
        {
          recipient: "0x6426458194b7fda928202d2717fabe20d95df37d",
          bps: 800,
        },
      ],
    },
    "0x9dba8ea4a81eb3b3aeadbcbca9e7e88dda205a81": {
      metadata: {
        description:
          "CryptoCommas are the PFP collection of MintCaster, a platform to find what's minting right now, explore the latest collections, and upcoming NFT projects.",
        twitterUrl: "https://twitter.com/MintCasterXYZ",
        discordUrl: "https://discord.gg/vuCGBHMEZG",
        externalUrl: "https://www.mintcaster.xyz",
      },
      royalties: [
        {
          recipient: "0x2c06c2c36523c5ff7a911908c48b7d18da744e54",
          bps: 750,
        },
      ],
    },
    "0xaba082d325adc08f9a1c5a8208bb5c42b3a6f978": {
      metadata: {
        twitterUrl: "http://twitter.com/playwildcard",
      },
    },
    "0x5fcfae331e919d679cc3bc07c15fcc6d5c7a93cb": {
      royalties: [
        {
          recipient: "0xd29ce02ae6d3e77aba0b580e45b8a2865396fbfc",
          bps: 500,
        },
      ],
    },
  };

  const contractMetadataOverride = metadataOverride[metadata.contract];

  if (contractMetadataOverride) {
    return {
      ...metadata,
      ...contractMetadataOverride,
      metadata: {
        ...metadata.metadata,
        ...contractMetadataOverride.metadata,
      },
    };
  }

  return metadata;
};
