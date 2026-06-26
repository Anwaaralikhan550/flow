import fp from "fastify-plugin";
import { paymentRequired, unauthorized } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const authPlugin = fp(async (app) => {
  app.decorate("authenticate", async (request) => {
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw unauthorized("Missing authorization header");
    }

    request.auth = await verifyAccessToken(app.redis, authorization);
    const validUntil = Date.parse(request.auth.validUntil);
    if (Number.isNaN(validUntil) || Date.now() > validUntil) {
      throw paymentRequired("Subscription Expired", "SUBSCRIPTION_EXPIRED");
    }
  });
});
