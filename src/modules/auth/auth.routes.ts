import type { FastifyPluginAsync } from "fastify";
import { env } from "../../config/env.js";
import { unauthorized } from "../../utils/errors.js";
import { revokeAccessToken, revokeRefreshToken } from "../../utils/jwt.js";
import { AuthService } from "./auth.service.js";
import { loginSchema, refreshSchema, type LoginBody } from "./auth.schemas.js";

const refreshCookieName = "refresh_token";

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function refreshCookie(token: string) {
  return [
    `${refreshCookieName}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/auth",
    `Max-Age=${env.JWT_REFRESH_TTL_SECONDS}`,
  ].join("; ");
}

function clearRefreshCookie() {
  return `${refreshCookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=0`;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: LoginBody }>(
    "/login",
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: env.AUTH_RATE_LIMIT_MAX,
          timeWindow: env.AUTH_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
      const service = new AuthService(app.prisma, app.redis);
      const result = await service.login({
        email: request.body.email,
        password: request.body.password,
        fingerprintId: request.body.fingerprint_id,
      });
      reply.header("Set-Cookie", refreshCookie(result.refreshToken));
      const { refreshToken: _refreshToken, ...response } = result;
      return response;
    },
  );

  app.post(
    "/refresh",
    {
      schema: refreshSchema,
      config: {
        rateLimit: {
          max: env.AUTH_RATE_LIMIT_MAX,
          timeWindow: env.AUTH_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply) => {
      const token = readCookie(request.headers.cookie, refreshCookieName);
      if (!token) {
        throw unauthorized("Missing refresh token", "MISSING_REFRESH_TOKEN");
      }

      const service = new AuthService(app.prisma, app.redis);
      const result = await service.refresh(token);
      reply.header("Set-Cookie", refreshCookie(result.refreshToken));
      const { refreshToken: _refreshToken, ...response } = result;
      return response;
    },
  );

  app.post(
    "/logout",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      if (!request.auth) {
        throw unauthorized();
      }

      await revokeAccessToken(app.redis, request.auth.jti);
      const token = readCookie(request.headers.cookie, refreshCookieName);
      if (token) {
        await revokeRefreshToken(app.redis, token);
      }
      reply.header("Set-Cookie", clearRefreshCookie());
      return { success: true };
    },
  );
};
