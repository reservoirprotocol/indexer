export const getBitVectorCalldataSize = (tokenIds: number[]) => {
  return Math.ceil(tokenIds[tokenIds.length - 1] / 8);
};

export const generateBitVector = (tokenIds: number[]) => {
  tokenIds.sort((a, b) => a - b);

  const numBytes = Math.ceil(tokenIds[tokenIds.length - 1] / 8);
  const result: number[] = [];
  for (let i = 0; i < numBytes; i++) {
    result.push(0);
  }

  for (const tokenId of tokenIds) {
    result[tokenId >> 3] |= 0x80 >> (tokenId & 7);
  }

  return "0x" + result.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const decomposeBitVector = (bitVector: string) => {
  const result: number[] = [];
  for (let i = 2; i < bitVector.length; i += 2) {
    const byte = parseInt(bitVector[i] + bitVector[i + 1], 16);
    for (let j = 7; j >= 0; j--) {
      if (byte & (1 << j)) {
        result.push((((i - 2) / 2) << 3) + (7 - j));
      }
    }
  }
  return result;
};
