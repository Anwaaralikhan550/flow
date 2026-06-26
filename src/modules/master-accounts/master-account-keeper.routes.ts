import crypto from "node:crypto";
import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import { MasterAccountStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { encryptCookie } from "../../config/crypto.js";
import { forbidden, notFound } from "../../utils/errors.js";
import { MasterAccountRepository } from "./master-account.repository.js";
import { validateCompleteVaultData } from "./vault-validation.js";

type KeeperSyncBody = {
  keeperKey: string;
  vaultData: string;
};

function hashKeeperKey(keeperKey: string) {
  return crypto.createHash("sha256").update(keeperKey).digest("hex");
}

function timingSafeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

const NEXT_AUTH_NAME_PATTERN = /next-auth/i;

/**
 * Temporary diagnostic: logs cookie NAMES (never values) from a real keeper
 * sync so we can confirm whether labs.google/fx sets its own NextAuth.js
 * session cookies, separate from classic Google account cookies. Informs a
 * future decision on whether vault-validation.ts's apex-cookie requirement
 * can be relaxed. Remove once that's answered.
 */
export function logNextAuthCookieNames(log: FastifyBaseLogger, vaultData: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(vaultData);
  } catch {
    return;
  }

  const cookies = Array.isArray(parsed) ? parsed : [parsed];
  const names = cookies
    .map((c) => (c && typeof c === "object" ? (c as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === "string");
  const nextAuthNames = names.filter((n) => NEXT_AUTH_NAME_PATTERN.test(n));

  log.info(
    { allCookieNames: names, nextAuthCookieNames: nextAuthNames, hasNextAuthCookies: nextAuthNames.length > 0 },
    "keeper-sync vault cookie names captured (diagnostic)",
  );
}

export const masterAccountKeeperRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string }; Body: KeeperSyncBody }>(
    "/:id/keeper-sync",
    {
      config: {
        rateLimit: {
          max: env.AUTH_RATE_LIMIT_MAX,
          timeWindow: env.AUTH_RATE_LIMIT_WINDOW,
        },
      },
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 8, maxLength: 128 } },
        },
        body: {
          type: "object",
          required: ["keeperKey", "vaultData"],
          additionalProperties: false,
          properties: {
            keeperKey: { type: "string", minLength: 16, maxLength: 128 },
            vaultData: { type: "string", minLength: 2 },
          },
        },
      },
    },
    async (request) => {
      const repository = new MasterAccountRepository(app.prisma);
      const account = await repository.findById(request.params.id);

      if (!account) {
        throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
      }

      if (!account.keeperKeyHash) {
        throw forbidden("This account has no keeper key configured", "KEEPER_NOT_CONFIGURED");
      }

      const providedHash = hashKeeperKey(request.body.keeperKey);
      if (!timingSafeEqual(providedHash, account.keeperKeyHash)) {
        throw forbidden("Invalid keeper key", "KEEPER_AUTH_FAILED");
      }

      if (account.status === MasterAccountStatus.DISABLED) {
        throw forbidden("This account is disabled by an admin and cannot be auto-synced", "MASTER_ACCOUNT_DISABLED");
      }

      validateCompleteVaultData(request.body.vaultData);

      logNextAuthCookieNames(request.log, request.body.vaultData);

      const encrypted = encryptCookie(request.body.vaultData);
      const updated = await repository.applyKeeperSync(account, encrypted.ciphertext, encrypted.nonce);

      return {
        synced: true,
        status: updated.status,
        vaultVersion: updated.vaultVersion,
        vaultHealth: updated.vaultHealth,
        lastVaultSyncAt: updated.lastVaultSyncAt?.toISOString() ?? null,
      };
    },
  );
};
