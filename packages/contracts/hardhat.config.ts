import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "hardhat-gas-reporter";
import "hardhat-tracer";

// For zkSync
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";

const getNetworkConfig = (chainId?: number) => {
  if (!chainId) {
    chainId = Number(process.env.CHAIN_ID ?? 1);
  }

  let url = process.env.RPC_URL;
  if (!url) {
    switch (chainId) {
      // Mainnets
      case 1:
        url = "https://rpc.mevblocker.io";
        break;
      case 10:
        url = "https://mainnet.optimism.io/";
        break;
      case 56:
        url = "https://bsc.drpc.org";
        break;
      case 137:
        url = "https://rpc-mainnet.matic.quiknode.pro";
        break;
      case 204:
        url = "https://opbnb-mainnet-rpc.bnbchain.org";
        break;
      case 324:
        url = "https://mainnet.era.zksync.io";
        break;
      case 1101:
        url = "https://zkevm-rpc.com";
        break;
      case 3776:
        url = "https://rpc.startale.com/astar-zkevm";
        break;
      case 8453:
        url = "https://developer-access-mainnet.base.org";
        break;
      case 42161:
        url = "https://arb1.arbitrum.io/rpc";
        break;
      case 42170:
        url = "https://arbitrum-nova.publicnode.com";
        break;
      case 43114:
        url = "https://avalanche-c-chain.publicnode.com";
        break;
      case 59144:
        url = "https://rpc.linea.build";
        break;
      case 534352:
        url = "https://rpc.scroll.io";
        break;
      case 7777777:
        url = "https://rpc.zora.co";
        break;
      case 68840142:
        url = "https://rpc.testnet.frame.xyz/http";
        break;
      case 888888888:
        url = "https://rpc.ancient8.gg/";
        break;
      case 70700:
        url = "https://rpc.apex.proofofplay.com";
        break;
      case 81457:
        url = "https://blast.blockpi.network/v1/rpc/public";
        break;
      // Testnets
      case 5:
        url = "https://goerli.blockpi.network/v1/rpc/public";
        break;
      case 5001:
        url = "https://rpc.testnet.mantle.xyz";
        break;
      case 59140:
        url = "https://rpc.goerli.linea.build/";
        break;
      case 80001:
        url = "https://rpc-mumbai.maticvigil.com";
        break;
      case 11155111:
        url = "https://1rpc.io/sepolia";
        break;
      case 28122024:
        url = "https://rpcv2-testnet.ancient8.gg/";
        break;
      case 84532:
        url = "https://sepolia.base.org";
        break;
      case 168587773:
        url = "https://sepolia.blast.io";
        break;
      default:
        throw new Error("Unsupported chain id");
    }
  }

  const config = {
    chainId,
    url,
    accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : undefined,
  };

  // For zkSync
  if (chainId === 324) {
    return {
      ...config,
      ethNetwork: "mainnet",
      zksync: true,
    };
  }

  return config;
};

const networkConfig = getNetworkConfig();
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    // Devnets
    hardhat: {
      chainId: networkConfig.chainId,
      forking: {
        url: networkConfig.url,
        blockNumber: process.env.BLOCK_NUMBER ? Number(process.env.BLOCK_NUMBER) : undefined,
      },
      accounts: {
        // Custom mnemonic so that the wallets have no initial state
        mnemonic:
          "void forward involve old phone resource sentence fall friend wait strike copper urge reduce chapter",
      },
    },
    localhost: {
      chainId: networkConfig.chainId,
      url: "http://127.0.0.1:8545",
    },
    // Mainnets
    mainnet: getNetworkConfig(1),
    optimism: getNetworkConfig(10),
    bsc: getNetworkConfig(56),
    polygon: getNetworkConfig(137),
    zkSync: getNetworkConfig(324),
    astarZkevm: getNetworkConfig(3776),
    polygonZkevm: getNetworkConfig(1101),
    base: getNetworkConfig(8453),
    arbitrum: getNetworkConfig(42161),
    arbitrumNova: getNetworkConfig(42170),
    avalanche: getNetworkConfig(43114),
    linea: getNetworkConfig(59144),
    scroll: getNetworkConfig(534352),
    zora: getNetworkConfig(7777777),
    opBnb: getNetworkConfig(204),
    ancient8: getNetworkConfig(888888888),
    apex: getNetworkConfig(70700),
    blast: getNetworkConfig(81457),
    // Testnets
    goerli: getNetworkConfig(5),
    mantleTestnet: getNetworkConfig(5001),
    lineaTestnet: getNetworkConfig(59140),
    mumbai: getNetworkConfig(80001),
    sepolia: getNetworkConfig(11155111),
    frameTestnet: getNetworkConfig(68840142),
    ancient8Testnet: getNetworkConfig(28122024),
    baseSepolia: getNetworkConfig(84532),
    blastSepolia: getNetworkConfig(168587773),
  },
  etherscan: {
    apiKey: {
      // Mainnets
      mainnet: process.env.ETHERSCAN_API_KEY_ETHEREUM ?? "",
      optimisticEthereum: process.env.ETHERSCAN_API_KEY_OPTIMISM ?? "",
      bsc: process.env.ETHERSCAN_API_KEY_BSC ?? "",
      polygon: process.env.ETHERSCAN_API_KEY_POLYGON ?? "",
      zkSync: "0x",
      astarZkevm: "0x",
      polygonZkevm: process.env.ETHERSCAN_API_KEY_POLYGON_ZKEVM ?? "",
      base: process.env.ETHERSCAN_API_KEY_BASE ?? "",
      arbitrumOne: process.env.ETHERSCAN_API_KEY_ARBITRUM ?? "",
      arbitrumNova: process.env.ETHERSCAN_API_KEY_ARBITRUM_NOVA ?? "",
      avalanche: "0x",
      linea: process.env.ETHERSCAN_API_KEY_LINEA ?? "",
      scroll: process.env.ETHERSCAN_API_KEY_SCROLL ?? "",
      zora: "0x",
      ancient8: "0x",
      opBnb: "0x",
      apex: "0x",
      blast: process.env.ETHERSCAN_API_KEY_BLAST ?? "",
      // Testnets
      goerli: process.env.ETHERSCAN_API_KEY_GOERLI ?? "",
      mantleTestnet: "0x",
      lineaTestnet: process.env.ETHERSCAN_API_KEY_LINEA_TESTNET ?? "",
      mumbai: process.env.ETHERSCAN_API_KEY_MUMBAI ?? "",
      sepolia: process.env.ETHERSCAN_API_KEY_SEPOLIA ?? "",
      frameTestnet: "0x",
      ancient8Testnet: "0x",
      baseSepolia: "0x",
      blastSepolia: process.env.ETHERSCAN_API_KEY_BLAST ?? "",
    },
    customChains: [
      // Mainnets
      {
        network: "zkSync",
        chainId: 324,
        urls: {
          apiURL: "https://block-explorer-api.mainnet.zksync.io/api",
          browserURL: "https://explorer.zksync.io",
        },
      },
      {
        network: "polygonZkevm",
        chainId: 1101,
        urls: {
          apiURL: "https://api-zkevm.polygonscan.com/api",
          browserURL: "https://zkevm.polygonscan.com",
        },
      },
      {
        network: "astarZkevm",
        chainId: 3776,
        urls: {
          apiURL: "https://astar-zkevm.explorer.startale.com/api",
          browserURL: "https://astar-zkevm.explorer.startale.com",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "arbitrumNova",
        chainId: 42170,
        urls: {
          apiURL: "https://api-nova.arbiscan.io/api",
          browserURL: "https://nova.arbiscan.io",
        },
      },
      {
        network: "avalanche",
        chainId: 43114,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
          browserURL: "https://avalanche.routescan.io",
        },
      },
      {
        network: "linea",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build",
        },
      },
      {
        network: "scroll",
        chainId: 534352,
        urls: {
          apiURL: "https://api.scrollscan.com/api",
          browserURL: "https://scrollscan.com",
        },
      },
      {
        network: "zora",
        chainId: 7777777,
        urls: {
          apiURL: "https://explorer.zora.energy/api",
          browserURL: "https://explorer.zora.energy",
        },
      },
      {
        network: "ancient8",
        chainId: 888888888,
        urls: {
          apiURL: "https://scan.ancient8.gg/api",
          browserURL: "https://scan.ancient8.gg",
        },
      },
      {
        network: "opBnb",
        chainId: 204,
        urls: {
          apiURL: "https://api-opbnb.bscscan.com/api",
          browserURL: "https://opbnb.bscscan.com/",
        },
      },
      {
        network: "apex",
        chainId: 70700,
        urls: {
          apiURL: "https://explorer.apex.proofofplay.com/api",
          browserURL: "https://explorer.apex.proofofplay.com/",
        },
      },
      {
        network: "blast",
        chainId: 81457,
        urls: {
          apiURL: "https://api.blastscan.io/api",
          browserURL: "https://blastscan.io/",
        },
      },
      // Testnets
      {
        network: "mantleTestnet",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
      {
        network: "lineaTestnet",
        chainId: 59140,
        urls: {
          apiURL: "https://api-testnet.lineascan.build/api",
          browserURL: "https://testnet.lineascan.build",
        },
      },
      {
        network: "mumbai",
        chainId: 80001,
        urls: {
          apiURL: "https://api-mumbai.polygonscan.com/api",
          browserURL: "https://mumbai.polygonscan.com",
        },
      },
      // This isn't working, couldn't find any valid API for their explorer
      {
        network: "frameTestnet",
        chainId: 68840142,
        urls: {
          apiURL: "https://explorer.testnet.frame.xyz/api",
          browserURL: "https://explorer.testnet.frame.xyz",
        },
      },
      {
        network: "ancient8Testnet",
        chainId: 28122024,
        urls: {
          apiURL: "https://scanv2-testnet.ancient8.gg/api",
          browserURL: "https://scanv2-testnet.ancient8.gg/",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org/",
        },
      },
      {
        network: "blastSepolia",
        chainId: 168587773,
        urls: {
          apiURL: "https://sepolia.blastscan.io/api",
          browserURL: "https://sepolia.blastscan.io/",
        },
      },
    ],
  },
  gasReporter: {
    enabled: Boolean(Number(process.env.REPORT_GAS)),
  },
  mocha: {
    timeout: 1000000,
  },
};

export default config;
