curl 'https://dev-rpc.zkfair.io' -X POST --data '
{
  "id": 0,
  "jsonrpc": "2.0",
  "method": "eth_getLogs",
  "params": [
    {
      "address": "0x828fa47d6b078f00a7728ab6bba2a10832e14491",
      "fromBlock": "earliest",
      "toBlock": "latest",
      "topics": [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        [],
        [],
        "0x00000000000000000000000000000000000000000000000000000000000058a9"
      ]
    }
  ]
}
' | jq
