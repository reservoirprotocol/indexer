export const APE_COIN_STAKING_MAINNET = "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9";

export const APE_COIN_NFT_CONTRACTS = [
  "0x0000000000000000000000000000000000000000", //placeholder
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", //bayc
  "0x60E4d786628Fea6478F785A6d7e704777c86a7c6", //mayc
  "0xba30E5F9Bb24caa003E9f2f0497Ad287FDF95623", //bakc
];

export const APE_COIN_STAKING_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_address",
        type: "address",
      },
    ],
    name: "getApeCoinStake",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tokenId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "deposited",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "unclaimed",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rewards24hr",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "mainTokenId",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "mainTypePoolId",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.DashboardPair",
            name: "pair",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.DashboardStake",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_address",
        type: "address",
      },
    ],
    name: "getBakcStakes",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tokenId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "deposited",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "unclaimed",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rewards24hr",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "mainTokenId",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "mainTypePoolId",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.DashboardPair",
            name: "pair",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.DashboardStake[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_address",
        type: "address",
      },
    ],
    name: "getBaycStakes",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tokenId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "deposited",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "unclaimed",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rewards24hr",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "mainTokenId",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "mainTypePoolId",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.DashboardPair",
            name: "pair",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.DashboardStake[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_address",
        type: "address",
      },
    ],
    name: "getMaycStakes",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tokenId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "deposited",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "unclaimed",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "rewards24hr",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "mainTokenId",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "mainTypePoolId",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.DashboardPair",
            name: "pair",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.DashboardStake[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPoolsUI",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "stakedAmount",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "startTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "endTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "rewardsPerHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "capPerPosition",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.TimeRange",
            name: "currentTimeRange",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.PoolUI",
        name: "",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "stakedAmount",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "startTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "endTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "rewardsPerHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "capPerPosition",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.TimeRange",
            name: "currentTimeRange",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.PoolUI",
        name: "",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "stakedAmount",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "startTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "endTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "rewardsPerHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "capPerPosition",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.TimeRange",
            name: "currentTimeRange",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.PoolUI",
        name: "",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "poolId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "stakedAmount",
            type: "uint256",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "startTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "endTimestampHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "rewardsPerHour",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "capPerPosition",
                type: "uint256",
              },
            ],
            internalType: "struct ApeCoinStaking.TimeRange",
            name: "currentTimeRange",
            type: "tuple",
          },
        ],
        internalType: "struct ApeCoinStaking.PoolUI",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

export const NFT_ABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "ownerOf",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
