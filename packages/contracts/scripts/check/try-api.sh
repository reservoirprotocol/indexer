curl 'https://api-zkfair-mainnet.alienswap.xyz/search/collections/v2?offset=0&limit=30' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
--compressed

curl 'http://localhost:30100/search/collections/v2?offset=0&limit=30' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
--compressed

# curl 'https://api-zkfair-mainnet.alienswap.xyz/search/collections/v2?offset=0&limit=30' \
#   -H 'authority: api-zkfair-mainnet.alienswap.xyz' \
#   -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
#   -H 'accept-language: en,zh-CN;q=0.9,zh;q=0.8' \
#   -H 'cache-control: max-age=0' \
#   -H 'cookie: _ga=GA1.1.709047400.1704431109; cf_clearance=a6Nq_k9rlO.3lIztylVwEnlEqulxEo86xRfHE5MzKDw-1704612218-0-2-5e76a717.d09d7c94.977f8f7-0.2.1704612218; _ga_7ZE5XDVL6Z=GS1.1.1704612220.12.1.1704614751.0.0.0' \
#   -H 'sec-ch-ua: "Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"' \
#   -H 'sec-ch-ua-mobile: ?0' \
#   -H 'sec-ch-ua-platform: "macOS"' \
#   -H 'sec-fetch-dest: document' \
#   -H 'sec-fetch-mode: navigate' \
#   -H 'sec-fetch-site: none' \
#   -H 'sec-fetch-user: ?1' \
#   -H 'upgrade-insecure-requests: 1' \
#   -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
#   --compressed