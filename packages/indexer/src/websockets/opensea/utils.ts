import crypto from "crypto";

export function generateHash(...params: string[]) {
  return crypto
    .createHash("sha256")
    .update(`${params.join("")}`)
    .digest("hex");
}
