import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "INTERNAL_ERROR",
  ) {
    super(message);
  }
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return new AppError(message, 400, code);
}

export function unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
  return new AppError(message, 401, code);
}

export function forbidden(message = "Forbidden", code = "FORBIDDEN") {
  return new AppError(message, 403, code);
}

export function paymentRequired(message = "Payment required", code = "PAYMENT_REQUIRED") {
  return new AppError(message, 402, code);
}

export function notFound(message = "Not found", code = "NOT_FOUND") {
  return new AppError(message, 404, code);
}

export function tooManyRequests(message = "Too many requests", code = "TOO_MANY_REQUESTS") {
  return new AppError(message, 429, code);
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(error.message || "Internal server error", error.statusCode ?? 500);

  if (appError.statusCode >= 500) {
    request.log.error({ error }, appError.message);
  }

  return reply.status(appError.statusCode).send({
    error: {
      code: appError.code,
      message: appError.message,
    },
  });
}
