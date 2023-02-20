import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
    [Network.Ethereum]: "0xbada5551b2f08d3959329b2ff8d0a7cc8be26324",
    [Network.EthereumGoerli]: "0xf0b83ed51fa7c9617dd48fe5864566bbd9519e4b",
    [Network.Polygon]: "0x5c600fff0ac90cdf026a16e4e315a2471f7bf7a6"
}

export const Complication: ChainIdToAddress = {
    [Network.Ethereum]: "0xbada5555fe632ace2c90fee8c060703369c25f1c",
    [Network.EthereumGoerli]: "0x6deb5e1a056975e0f2024f3d89b6d2465bde22af",
    [Network.Polygon]: "0x748c74994fff570d7e3fd14f25c17c3d9702832c"
}