import { redis } from "@/common/redis";

export type AuthChallenge = {
  message: string;
  walletAddress: string;
  expiresOn: string;
  hmac: string;
};

export const getAuthChallengeId = (taker: string) => `blur-auth-challenge:${taker}`;

export const saveAuthChallenge = async (
  id: string,
  authChallenge: AuthChallenge,
  expiresIn: number
) =>
  expiresIn === 0
    ? redis.set(id, JSON.stringify(authChallenge), "KEEPTTL")
    : redis.set(id, JSON.stringify(authChallenge), "EX", expiresIn);

export const getAuthChallenge = async (id: string) =>
  redis.get(id).then((s) => (s ? (JSON.parse(s) as AuthChallenge) : undefined));

export type Auth = {
  accessToken: string;
};

export const getAuthId = (taker: string) => `blur-auth:${taker}`;

export const saveAuth = async (id: string, auth: Auth, expiresIn: number) =>
  expiresIn === 0
    ? redis.set(id, JSON.stringify(auth), "KEEPTTL")
    : redis.set(id, JSON.stringify(auth), "EX", expiresIn);

export const getAuth = async (id: string) =>
  redis.get(id).then((s) => (s ? (JSON.parse(s) as Auth) : undefined));
