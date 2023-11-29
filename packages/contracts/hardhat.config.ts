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
        url = "https://eth.llamarpc.com";
        break;
      case 10:
        url = "https://optimism.llamarpc.com";
        break;
      case 56:
        url = "https://bsc.meowrpc.com";
        break;
      case 137:
        url = "https://polygon.llamarpc.com";
        break;
      case 324:
        url = "https://mainnet.era.zksync.io";
        break;
      case 1101:
        url = "https://zkevm-rpc.com";
        break;
      case 8453:
        url = "https://developer-access-mainnet.base.org";
        break;
      case 42161:
        url = "https://arbitrum.llamarpc.com";
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
      case 7777777:
        url = "https://rpc.zora.co";
        break;
      case 534352:
        url = "https://rpc.ankr.com/scroll";
        break;
      // Testnets
      case 5:
        url = "https://goerli.blockpi.network/v1/rpc/public";
        break;
      case 999:
        url = "https://testnet.rpc.zora.co";
        break;
      case 5001:
        url = "https://rpc.testnet.mantle.xyz";
        break;
      case 59140:
        url = "https://rpc.goerli.linea.build/";
        break;
      case 80001:
        url = "https://endpoints.omniatech.io/v1/matic/mumbai/public";
        break;
      case 84531:
        url = "https://goerli.base.org";
        break;
      case 534353:
        url = "https://alpha-rpc.scroll.io/l2";
        break;
      case 11155111:
        url = "https://1rpc.io/sepolia";
        break;
      case 2863311531:
        url = "https://rpc-testnet.ancient8.gg/";
        break;
      case 13472:
        url = "https://rpc.testnet.immutable.com/";
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
        blockNumber: Number(process.env.BLOCK_NUMBER),
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
    polygonZkevm: getNetworkConfig(1101),
    base: getNetworkConfig(8453),
    arbitrum: getNetworkConfig(42161),
    arbitrumNova: getNetworkConfig(42170),
    avalanche: getNetworkConfig(43114),
    linea: getNetworkConfig(59144),
    zora: getNetworkConfig(7777777),
    scroll: getNetworkConfig(534352),
    // Testnets
    goerli: getNetworkConfig(5),
    zoraTestnet: getNetworkConfig(999),
    mantleTestnet: getNetworkConfig(5001),
    lineaTestnet: getNetworkConfig(59140),
    mumbai: getNetworkConfig(80001),
    baseGoerli: getNetworkConfig(84531),
    scrollAlpha: getNetworkConfig(534353),
    sepolia: getNetworkConfig(11155111),
    ancient8Testnet: getNetworkConfig(2863311531),
    immutableZkevmTestnet: getNetworkConfig(13472),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
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
          apiURL: "https://explorer.goerli.linea.build/api",
          browserURL: "https://explorer.goerli.linea.build",
        },
      },
      {
        network: "scrollAlpha",
        chainId: 534353,
        urls: {
          apiURL: "https://blockscout.scroll.io/api",
          browserURL: "https://blockscout.scroll.io/",
        },
      },
      {
        network: "ancient8Testnet",
        chainId: 2863311531,
        urls: {
          apiURL: "https://testnet.a8scan.io/api",
          browserURL: "https://testnet.a8scan.io/",
        },
      },
      {
        network: "zoraTestnet",
        chainId: 999,
        urls: {
          apiURL: "https://testnet.explorer.zora.energy/api",
          browserURL: "https://testnet.explorer.zora.energy/",
        },
      },
    ],
  },
  gasReporter: {
    enabled: Boolean(Number(process.env.REPORT_GAS)),
  },
  mocha: {
    timeout: 60000 * 10,
  },
};

export default config;
