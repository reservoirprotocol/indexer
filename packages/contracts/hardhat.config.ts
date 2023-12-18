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
      // Mainnets
      case 1:
        url = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 10:
        url = `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 56:
        url = "https://bsc.meowrpc.com";
        break;
      case 137:
        url = `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 195:
        url = "https://testrpc.x1.tech";
        break;
      case 8453:
        url = "https://developer-access-mainnet.base.org";
        break;
      case 42161:
        url = `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 42170:
        url = "https://arbitrum-nova.publicnode.com";
        break;
      case 43114:
        url = "https://avalanche-c-chain.publicnode.com";
        break;
      // zkfair-testnet
      case 43851:
        url = "https://testnet-rpc.zkfair.io";
        break;
      case 59144:
        url = "https://rpc.linea.build";
        break;
      case 7777777:
        url = "https://rpc.zora.co";
        break;
      // Testnets
      case 5:
        url = `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
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
        url = `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
        break;
      case 84531:
        url = "https://goerli.base.org";
        break;
      case 534353:
        url = "https://alpha-rpc.scroll.io/l2";
        break;
      case 11155111:
        url = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
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
      url: "http://127.0.0.1:8545",
    },
    // Mainnets
    mainnet: getNetworkConfig(1),
    optimism: getNetworkConfig(10),
    bsc: getNetworkConfig(56),
    polygon: getNetworkConfig(137),
    base: getNetworkConfig(8453),
    arbitrum: getNetworkConfig(42161),
    arbitrumNova: getNetworkConfig(42170),
    avalanche: getNetworkConfig(43114),
    linea: getNetworkConfig(59144),
    zora: getNetworkConfig(7777777),
    // Testnets
    goerli: getNetworkConfig(5),
    x1Testnet: getNetworkConfig(195),
    zoraTestnet: getNetworkConfig(999),
    mantleTestnet: getNetworkConfig(5001),
    zkfairTestnet: getNetworkConfig(43851),
    lineaTestnet: getNetworkConfig(59140),
    mumbai: getNetworkConfig(80001),
    baseGoerli: getNetworkConfig(84531),
    scrollAlpha: getNetworkConfig(534353),
    sepolia: getNetworkConfig(11155111),
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "x1Testnet",
        chainId: 195,
        urls: {
          apiURL: "",
          browserURL: "https://www.oklink.com/cn/x1-test",
        },
      },
      {
        network: "mantleTestnet",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
      {
        network: "zkfairTestnet",
        chainId: 43851,
        urls: {
          apiURL: "https://testnet-scan.zkfair.io/api",
          browserURL: "https://testnet-scan.zkfair.io",
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
        network: "baseGoerli",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org",
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
