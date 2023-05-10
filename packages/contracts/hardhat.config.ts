import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "hardhat-gas-reporter";
import "hardhat-tracer";

const getNetworkConfig = (chainId?: number) => {
  if (!chainId) {
    chainId = Number(process.env.CHAIN_ID ?? 1);
  }

  let url = process.env.RPC_URL;
  if (!url) {
    switch (chainId) {
      case 1:
        url = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 5:
        url = `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 10:
        url = `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 137:
        url = `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 42161:
        url = `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 534353:
        url = "https://alpha-rpc.scroll.io/l2";
      case 5001:
        url = "https://rpc.testnet.mantle.xyz";
        break;
      default:
        throw new Error("Unsupported chain id");
    }
  }

  return {
    chainId,
    url,
    accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : undefined,
  };
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
    // Development
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
      url: "http://127.0.0.1:8545",
    },
    // Testnets
    goerli: getNetworkConfig(5),
    // Mainnets
    mainnet: getNetworkConfig(1),
    optimism: getNetworkConfig(10),
    polygon: getNetworkConfig(137),
    arbitrum: getNetworkConfig(42161),
    "scroll-alpha": getNetworkConfig(534353),
    "mantle-testnet": getNetworkConfig(5001),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "scroll-alpha",
        chainId: 534353,
        urls: {
          apiURL: "https://blockscout.scroll.io/api",
          browserURL: "https://blockscout.scroll.io/",
        },
      },
      {
        network: "mantle-testnet",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
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
