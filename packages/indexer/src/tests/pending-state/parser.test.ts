import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import * as ppv2 from "../../utils/pending-txs/parser/payment-processor-v2";
import * as blur from "../../utils/pending-txs/parser/blur";

import { describe, jest, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("ParseToken", () => {
  it("ppv2", async () => {
    const calldataList = [
      // buyListing
      `0xc32dacae000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000003809a1c0e9c1617e69414ac5a84b68587c2192d6f67c055877ef41c0ab90db8bd9e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e194be586919965a187d9aab28a92f6c1f0293dc000000000000000000000000b66ddd73464053ba6e0753ad3003eef9578040ff0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005d2ab1f930ce63778ce0ae81bd01142435aef35b000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000e2ef15038861239b0d06000000000000000000000000000000000000000000000000000000006595559e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001bd8a9dff3e20081bfd6ce272997145556f3a1e9bc688b06fc574f4153f68520e8054136671babb442a680922de6298609969f3c5fa26de91934422eb22944d8750000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`,
      // bulkBuyListings
      `0x863eb2d2000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000007e09a1c0e9c1617e69414ac5a84b68587c2192d6f67c055877ef41c0ab90db8bd9e00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000004c000000000000000000000000000000000000000000000000000000000000005a0000000000000000000000000000000000000000000000000000000000000074000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e194be586919965a187d9aab28a92f6c1f0293dc000000000000000000000000b66ddd73464053ba6e0753ad3003eef9578040ff0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005d2ab1f930ce63778ce0ae81bd01142435aef35b000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000060aacc12ea2b4670dff300000000000000000000000000000000000000000000000000000000659555a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e194be586919965a187d9aab28a92f6c1f0293dc000000000000000000000000b66ddd73464053ba6e0753ad3003eef9578040ff000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000bcab4424bdb7442c2a85080e0bbeca1a5c37b941000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000ca414428dabb40da3a3700000000000000000000000000000000000000000000000000000000659555a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001b4736e80e1f3d0e4cfde329f1f41ba72e25e86b51323bc136d5d63e9bdb6876674fc50017329e917041425ca1e480d24c9144e516896fa135a4dc282e3b04c255000000000000000000000000000000000000000000000000000000000000001c117700ab2124d697590efdc61c647558fe0ac2d8640b98a2257b9bcf4042cf5561f7af66655b24d293f5ca325d7b93dd1211b5f0c73ed8da9be5573cf5fe9bb60000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000013cda86710b286a706030204693b5841a17760cd00000000000000000000000000000000000000000000000000c3663566a5800000000000000000000000000013cda86710b286a706030204693b5841a17760cd00000000000000000000000000000000000000000000000000c3663566a5800003354c59`,
      // sweepCollection
      `0x96c3ae25000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006609a1c0e9c1617e69414ac5a84b68587c2192d6f67c055877ef41c0ab90db8bd9e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005d2ab1f930ce63778ce0ae81bd01142435aef35b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b66ddd73464053ba6e0753ad3003eef9578040ff000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000003e000000000000000000000000000000000000000000000000000000000000004c00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000e194be586919965a187d9aab28a92f6c1f0293dc00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000aedb1584e5b978b261f1000000000000000000000000000000000000000000000000000000006595559f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e194be586919965a187d9aab28a92f6c1f0293dc00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000af563a2d745880236d19000000000000000000000000000000000000000000000000000000006595559f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001ce67385f914469c3a2d8e479f969c8c47c003b862979dd0dc8e65339f3802a1a40c27b153c6017328cfbf94465ccb132b730ad500ae278753fb8c9b27eeda5bb2000000000000000000000000000000000000000000000000000000000000001c9458c310e7f41e06d7d851c86331799d06eadaa7df49adc8ce0e338b8743e5f5756cfff8d201411402088dfc3ab4e23aff232b36f36cb9eefd381ae600d6cf61000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003354c59`,
    ];
    for (const calldata of calldataList) {
      const tokens = await ppv2.parseTokensFromCalldata(calldata);
      expect(tokens.length).not.toBe(0);
    }
  });

  it("blur", async () => {
    const calldataList = [
      // execute
      `0x9a1fc3a7000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000004c000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001b55191423bafe003c827de001a404f21455a51b01f581955f9a7ec07d045f5c547814ef07d919a70ca969a785253b1e033d7b2bc04f0e943788a1cdff76dde23c00000000000000000000000000000000000000000000000000000000000002e0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000010fb111000000000000000000000000a29f7b8e549c48435e1f5e67c30cb1e47eedd8a900000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000dab4a563819e8fd93dba3b25bc3495000000000000000000000000e0a5201b88120acb02e420f027c4a1bc6c18fdd000000000000000000000000000000000000000000000000000000000000003430000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005af3107a40000000000000000000000000000000000000000000000000000000000063f648e10000000000000000000000000000000000000000000000000000000064e396de00000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000540ba66b9d67f3165a53785ab0e925ca00000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000001bdc3f8524359b8a5a3aebebbfa499b1b59bdfa6daf3f4af13fdbfb23c2f4bef6855a70ea5d7bdc732cf7cb6dc64084230f732324d6bd7acd8e97ad9948d06250d0000000000000000000000000000000000000000000000000000000000000007f0be099dca7db089eaee5268112ba0c0ace943bcd64eb3c1d8a9ce3dfb56c48d18d9b5e963dd361de16169c3ce9459fdb6217f5d8274c8e9d514a525796151f26cea452dff422ace3a14c51ebe805fb3a37bece4a0869d32e18c6d7e09101992ef96fb442d36e717a5593c2348a0944cbb815b2ca458445f6414412087968a404078abdeb86b8dc82987dcdebfd3ee55fe12fa34eb425b7af9d9fc3d1fbd8e072324344ef9d52206c7333ba05965c423ebeb3d96a2eed516412c9a41912cf009f454224e789e54fbe4fb14967246feff7f489164e1908505a6725ac4a6906bbd00000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010fb11100000000000000000000000006414d5635af817f4d5f1074429843916f3fc75300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000dab4a563819e8fd93dba3b25bc3495000000000000000000000000e0a5201b88120acb02e420f027c4a1bc6c18fdd000000000000000000000000000000000000000000000000000000000000003430000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005af3107a40000000000000000000000000000000000000000000000000000000000063f648e20000000000000000000000000000000000000000000000000000000064c6593400000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000a5e4452a3252a605b43e0e07ee149a4000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000101000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000001c859d7423007947bf90082bd3fd40849718e93d56e23087af635c0ca621a2962a34f8254ea7b42ec7cb0ecf8097f53f41c8fa8cfa84e5a04e1540245bb8e88e831d4da48b274ce220`,
      // bulkExecute
      `0xb3be57f80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000007e00000000000000000000000000000000000000000000000000000000000000f2000000000000000000000000000000000000000000000000000000000000016600000000000000000000000000000000000000000000000000000000000001da00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000042000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001bc6f22a38b7afdc0bcc1d00593792e7e40ec64d80e2fc2317bfa49d2ec641077d5a90eb0c06851d61e1192de758ba91ac5939cbff0a1c45bd4d02c818cafe604200000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000123433900000000000000000000000051597c5ef4b7643245f735558e7f67ceb50a6a7f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac0000000000000000000000009c80777cae192e5031c38a0d951c55730ecc3f5e00000000000000000000000000000000000000000000000000000000000015180000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000725b5cb493468228d268969b312e7d4a000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000075c1a1d1e43b9a00688703f071a919b600000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000036b8aea28dcd76c4787f71d211e8889c56f56abb230b9d89728e77ef19a31b29b2dfdac4eae9459b5a067c07e3523e759faba846251d14c0b579c9ae85f2956e5fe29129039af6561263916cc80c9e6dfe42d6274f760a90db9ccd9adce28613100000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000123439c0000000000000000000000000000db5c8b030ae20308ac975898e09741e70000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac0000000000000000000000009c80777cae192e5031c38a0d951c55730ecc3f5e00000000000000000000000000000000000000000000000000000000000015180000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000f0bf208717549ab514470ab707b0932000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000202392c134d0202e51273f01003e50a946ac9a9d33bbe51495f302274786b84d450000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000042000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001bc6f22a38b7afdc0bcc1d00593792e7e40ec64d80e2fc2317bfa49d2ec641077d5a90eb0c06851d61e1192de758ba91ac5939cbff0a1c45bd4d02c818cafe604200000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000123433900000000000000000000000051597c5ef4b7643245f735558e7f67ceb50a6a7f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac0000000000000000000000003005d657b8d904d40dd145180a202c277798942e00000000000000000000000000000000000000000000000000000000000000560000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000049c9bb7844569b111430a24962a19cce000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000075c1a1d1e43b9a00688703f071a919b600000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003a9a4a2b204d7fcf564d43a3f66f8c34530b639c3a642fcac80556a7cb27992462dfdac4eae9459b5a067c07e3523e759faba846251d14c0b579c9ae85f2956e5fe29129039af6561263916cc80c9e6dfe42d6274f760a90db9ccd9adce28613100000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000123439c0000000000000000000000000000db5c8b030ae20308ac975898e09741e70000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac0000000000000000000000003005d657b8d904d40dd145180a202c277798942e00000000000000000000000000000000000000000000000000000000000000560000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000015fc91d09fd432aa205a8a2d931dfd0bb00000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000205863ccece02d051e420330b099e260f423c6511ddadb80cb03ac6101eaf06bd80000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000042000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001bc6f22a38b7afdc0bcc1d00593792e7e40ec64d80e2fc2317bfa49d2ec641077d5a90eb0c06851d61e1192de758ba91ac5939cbff0a1c45bd4d02c818cafe604200000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000123433900000000000000000000000051597c5ef4b7643245f735558e7f67ceb50a6a7f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac000000000000000000000000198478f870d97d62d640368d111b979d7ca3c38f00000000000000000000000000000000000000000000000000000000000003890000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000002644a9723dd0e8b4235911986be5092ac000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000075c1a1d1e43b9a00688703f071a919b600000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000032538b96801b2384193e93123a3f37d35afd1133599cb4ad41f41f5d4e85a950a1da7bb5cff03959b7e335631a92224e8f867c6468bfc29ccd1f42a3e8238ba94fe29129039af6561263916cc80c9e6dfe42d6274f760a90db9ccd9adce28613100000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000123439c0000000000000000000000000000db5c8b030ae20308ac975898e09741e70000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac000000000000000000000000198478f870d97d62d640368d111b979d7ca3c38f00000000000000000000000000000000000000000000000000000000000003890000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000139c59216013f33b898e09a87fb29f75800000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020c907ac905f37f5599a6cefb68c8e09aa969ca03cce36d464774430817414f7f30000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000042000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001bc6f22a38b7afdc0bcc1d00593792e7e40ec64d80e2fc2317bfa49d2ec641077d5a90eb0c06851d61e1192de758ba91ac5939cbff0a1c45bd4d02c818cafe604200000000000000000000000000000000000000000000000000000000000003200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000123433900000000000000000000000051597c5ef4b7643245f735558e7f67ceb50a6a7f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac000000000000000000000000ca21d4228cdcc68d4e23807e5e370c07577dd15200000000000000000000000000000000000000000000000000000000000016020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000011dd974e854d871ceb3ef53055eee0ac0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000075c1a1d1e43b9a00688703f071a919b600000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000034632d4ba21b7663917bf7ec049f9ab48add719db96d0c4274aea528f99975ffa1da7bb5cff03959b7e335631a92224e8f867c6468bfc29ccd1f42a3e8238ba94fe29129039af6561263916cc80c9e6dfe42d6274f760a90db9ccd9adce28613100000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000123439c0000000000000000000000000000db5c8b030ae20308ac975898e09741e70000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac000000000000000000000000ca21d4228cdcc68d4e23807e5e370c07577dd15200000000000000000000000000000000000000000000000000000000000016020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000d2e8b644cf442240e83d1265496a17200000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020b69fb0b2316781758373168fc50d180e668819c14309b7dfbbd9fc476c703b700000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000036000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000123439c0000000000000000000000000000db5c8b030ae20308ac975898e09741e70000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000000006b35aa35b2adfacbbddcf40e2ff7934f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000a39bb272e79075ade125fd351887ac000000000000000000000000000000000000000000000000002386f26fc100000000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000012f8e78bdf574fc79d12ec199218c32b500000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020486a3f8baddb33f4478132312c18a943feaf8dec8ed77fcd31e47d0e0cf8699b00000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001bc6f22a38b7afdc0bcc1d00593792e7e40ec64d80e2fc2317bfa49d2ec641077d5a90eb0c06851d61e1192de758ba91ac5939cbff0a1c45bd4d02c818cafe604200000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000123433900000000000000000000000051597c5ef4b7643245f735558e7f67ceb50a6a7f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000000006b35aa35b2adfacbbddcf40e2ff7934f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000a39bb272e79075ade125fd351887ac000000000000000000000000000000000000000000000000002386f26fc100000000000000000000000000000000000000000000000000000000000065a9f4f500000000000000000000000000000000000000000000000000000000787f327500000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000695e2aa34b196448ddf56dd8e58bb6d300000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001264aa6d44d67fc65108a6aecdc23597ab67e896c6595732ebf35cdc80a04641a`,
    ];
    for (const calldata of calldataList) {
      const tokens = await blur.parseTokensFromCalldata(calldata);
      expect(tokens.length).not.toBe(0);
    }
  });
});
