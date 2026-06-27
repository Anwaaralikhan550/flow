import crypto from "node:crypto";
import type { Redis } from "ioredis";
import { importPKCS8, importSPKI, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { unauthorized } from "./errors.js";

const privateKeyPem = Buffer.from(env.JWT_PRIVATE_KEY_BASE64, "base64").toString("utf8");
const publicKeyPem = Buffer.from(env.JWT_PUBLIC_KEY_BASE64, "base64").toString("utf8");

const privateKey = importPKCS8(privateKeyPem, "RS256");
const publicKey = importSPKI(publicKeyPem, "RS256");

export type AuthContext = {
  userId: string;
  jti: string;
  fingerprintId: string;
  role: string;
  plan: string;
  validUntil: string;
  configHash: string;
};

type SessionRecord = {
  userId: string;
  fingerprintId: string;
  role: string;
  plan: string;
  validUntil: string;
  configHash: string;
  issuedAt: number;
};

type RefreshRecord = {
  userId: string;
  fingerprintId: string;
  issuedAt: number;
};

export type RefreshContext = {
  userId: string;
  jti: string;
  fingerprintId: string;
};

function safeEqual(left: string, right: string) {
  const leftDigest = crypto.createHash("sha256").update(left).digest();
  const rightDigest = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function parseRedisRecord<T>(raw: string, revokedMessage: string, revokedCode: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw unauthorized(revokedMessage, revokedCode);
  }
}

export async function issueAccessToken(
  redis: Redis,
  params: { userId: string; fingerprintId: string; role: string; plan: string; validUntil: Date; configHash: string },
) {
  const jti = nanoid(32);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + env.JWT_ACCESS_TTL_SECONDS;

  const validUntil = params.validUntil.toISOString();
  const token = await new SignJWT({
    fingerprintId: params.fingerprintId,
    role: params.role,
    plan: params.plan,
    validUntil,
    configHash: params.configHash,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(params.userId)
    .setJti(jti)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(expiresAt)
    .sign(await privateKey);

  const record: SessionRecord = {
    userId: params.userId,
    fingerprintId: params.fingerprintId,
    role: params.role,
    plan: params.plan,
    validUntil,
    configHash: params.configHash,
    issuedAt: now,
  };

  await redis.set(`session:${jti}`, JSON.stringify(record), "EX", env.JWT_ACCESS_TTL_SECONDS);

  return {
    token,
    tokenType: "Bearer",
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    jti,
  };
}

export async function issueRefreshToken(
  redis: Redis,
  params: { userId: string; fingerprintId: string },
) {
  const jti = nanoid(32);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + env.JWT_REFRESH_TTL_SECONDS;

  const token = await new SignJWT({
    fingerprintId: params.fingerprintId,
    tokenUse: "refresh",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(params.userId)
    .setJti(jti)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(expiresAt)
    .sign(await privateKey);

  const record: RefreshRecord = {
    userId: params.userId,
    fingerprintId: params.fingerprintId,
    issuedAt: now,
  };

  await redis.set(`refresh:${jti}`, JSON.stringify(record), "EX", env.JWT_REFRESH_TTL_SECONDS);

  return {
    token,
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
    jti,
  };
}

export async function issueTokenPair(
  redis: Redis,
  params: { userId: string; fingerprintId: string; role: string; plan: string; validUntil: Date; configHash: string },
) {
  const [accessToken, refreshToken] = await Promise.all([
    issueAccessToken(redis, params),
    issueRefreshToken(redis, params),
  ]);

  return { accessToken, refreshToken };
}

export async function verifyAccessToken(redis: Redis, bearerToken: string): Promise<AuthContext> {
  const token = bearerToken.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw unauthorized("Missing bearer token");
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, await publicKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["RS256"],
      typ: "JWT",
      clockTolerance: "5 seconds",
    });
    payload = verified.payload;
  } catch {
    throw unauthorized("Invalid or expired token", "INVALID_TOKEN");
  }

  if (
    !payload.sub ||
    !payload.jti ||
    typeof payload.fingerprintId !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.plan !== "string" ||
    typeof payload.validUntil !== "string" ||
    typeof payload.configHash !== "string"
  ) {
    throw unauthorized("Invalid token claims", "INVALID_TOKEN_CLAIMS");
  }

  const rawSession = await redis.get(`session:${payload.jti}`);
  if (!rawSession) {
    throw unauthorized("Session is expired or revoked", "SESSION_REVOKED");
  }

  const session = parseRedisRecord<SessionRecord>(rawSession, "Session is expired or revoked", "SESSION_REVOKED");
  if (
    !safeEqual(session.userId, payload.sub) ||
    !safeEqual(session.fingerprintId, payload.fingerprintId) ||
    !safeEqual(session.role, payload.role) ||
    !safeEqual(session.plan, payload.plan) ||
    !safeEqual(session.validUntil, payload.validUntil) ||
    !safeEqual(session.configHash, payload.configHash)
  ) {
    throw unauthorized("Session does not match token", "SESSION_MISMATCH");
  }

  return {
    userId: payload.sub,
    jti: payload.jti,
    fingerprintId: payload.fingerprintId,
    role: payload.role,
    plan: payload.plan,
    validUntil: payload.validUntil,
    configHash: payload.configHash,
  };
}

export async function revokeAccessToken(redis: Redis, jti: string) {
  await redis.del(`session:${jti}`);
}

export async function consumeRefreshToken(redis: Redis, refreshToken: string): Promise<RefreshContext> {
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(refreshToken, await publicKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["RS256"],
      typ: "JWT",
      clockTolerance: "5 seconds",
    });
    payload = verified.payload;
  } catch {
    throw unauthorized("Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
  }

  if (
    !payload.sub ||
    !payload.jti ||
    payload.tokenUse !== "refresh" ||
    typeof payload.fingerprintId !== "string"
  ) {
    throw unauthorized("Invalid refresh token claims", "INVALID_REFRESH_TOKEN_CLAIMS");
  }

  const rawSession = await redis.getdel(`refresh:${payload.jti}`);
  if (!rawSession) {
    throw unauthorized("Refresh token is expired or revoked", "REFRESH_TOKEN_REVOKED");
  }

  const session = parseRedisRecord<RefreshRecord>(
    rawSession,
    "Refresh token is expired or revoked",
    "REFRESH_TOKEN_REVOKED",
  );
  if (!safeEqual(session.userId, payload.sub) || !safeEqual(session.fingerprintId, payload.fingerprintId)) {
    throw unauthorized("Refresh session does not match token", "REFRESH_SESSION_MISMATCH");
  }

  return {
    userId: payload.sub,
    jti: payload.jti,
    fingerprintId: payload.fingerprintId,
  };
}

export async function revokeRefreshToken(redis: Redis, refreshToken: string) {
  try {
    const verified = await jwtVerify(refreshToken, await publicKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["RS256"],
      typ: "JWT",
      clockTolerance: "5 seconds",
    });
    if (verified.payload.jti && verified.payload.tokenUse === "refresh") {
      await redis.del(`refresh:${verified.payload.jti}`);
    }
  } catch {
    // An invalid refresh cookie has no server-side session to preserve.
  }
}
