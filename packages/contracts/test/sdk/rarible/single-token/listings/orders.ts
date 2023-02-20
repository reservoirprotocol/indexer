export const v2ApiOrder = {
  id: "ETHEREUM:0xe0cfa20146cca1e7ac2c653a8622c07479ab8c1deb6b717273e7910b263402ad",
  data: {
    "@type": "ETH_RARIBLE_V2",
    payouts: [],
    dataType: "V2",
    originFees: [
      {
        value: 100,
        account: "0x1cf0df2a5a20cd61d68d4489eebbf85b8d39e18a",
      },
    ],
  },
  fill: "0",
  make: {
    type: {
      uri: "/ipfs/bafkreihqhwbcbducudq7rtkhw745zev2rchrnedsjsrqg5v7id64ao7qeq",
      "@type": "ERC721_Lazy",
      tokenId:
        "14249935687019880220331675599890107805503880793603843647268203129203631063377",
      contract: "ETHEREUM:0xc9154424b823b10579895ccbe442d41b9abd96ed",
      creators: [
        {
          value: 10000,
          account: "ETHEREUM:0x1f812d82f8d145ea722e365432cb591b2677d265",
        },
      ],
      royalties: [
        {
          value: 1000,
          account: "ETHEREUM:0x1f812d82f8d145ea722e365432cb591b2677d265",
        },
      ],
      signatures: [
        "0xc30f026bb5d15872c351f3c47bc42f96669fff7db8a7fa06acb8bf39611d38983beaca73b0ee348f98da07cd8caad16656b28216138a177181fb25da655a96ed1b",
      ],
    },
    value: "1",
  },
  salt: "0xa735dbff3da6f1082127615b5418c9cb56e3b0a9950e54e44b7edcdf8da6b264",
  take: {
    type: {
      "@type": "ETH",
      blockchain: "ETHEREUM",
    },
    value: "0.009",
  },
  maker: "ETHEREUM:0x1f812d82f8d145ea722e365432cb591b2677d265",
  status: "ACTIVE",
  platform: "RARIBLE",
  cancelled: false,
  createdAt: "2022-10-24T08:17:25.266Z",
  makePrice: "0.009",
  makeStock: "1",
  signature:
    "0xfe2064cd19bc06b05919781cabfa4f35ebe5d791b1e34e43d14f713940983f93163ee4b3acebd10272b28eb9ae99230b55733b14dfbe5483c878757741a2835b1b",
  dbUpdatedAt: "2022-10-24T08:17:25.311Z",
  makePriceUsd: "12.1126754113263",
  lastUpdatedAt: "2022-10-24T08:17:25.266Z",
  optionalRoyalties: false,
};
