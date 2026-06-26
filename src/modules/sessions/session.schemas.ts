export const leaseAccountSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        available: { type: "boolean" },
        retryAfterMs: { type: "number" },
        message: { type: "string" },
        leaseId: { type: "string" },
        provider: { type: "string" },
        expiresAt: { type: "string" },
        remainingLimit: { type: "number" },
        vaultVersion: { type: "number" },
        vaultData: { type: ["string", "null"] },
        proxy: {
          type: ["object", "null"],
          properties: {
            host: { type: "string" },
            port: { type: "number" },
            username: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export const releaseUsageSchema = {
  body: {
    type: "object",
    required: ["leaseId"],
    additionalProperties: false,
    properties: {
      leaseId: { type: "string", minLength: 8, maxLength: 128 },
      submitted: { type: "boolean" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        released: { type: "boolean" },
      },
    },
  },
} as const;

export const reportUsageSchema = {
  body: {
    type: "object",
    required: ["leaseId"],
    additionalProperties: false,
    properties: {
      leaseId: { type: "string", minLength: 8, maxLength: 128 },
      outcome: {
        type: "string",
        enum: ["SUCCESS", "RATE_LIMITED", "QUOTA_EXHAUSTED", "TRANSIENT_ERROR", "AUTH_INVALID"],
      },
      usageUnits: { type: "integer", minimum: 1, maximum: 100 },
      providerStatusCode: { type: "integer", minimum: 100, maximum: 599 },
      providerErrorType: { type: "string", maxLength: 128 },
      providerMessage: { type: "string", maxLength: 1000 },
      retryAfterSeconds: { type: "integer", minimum: 1, maximum: 3600 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        outcome: { type: "string" },
        accepted: { type: "boolean" },
      },
    },
  },
} as const;

export type ReportUsageBody = {
  leaseId: string;
  outcome?: "SUCCESS" | "RATE_LIMITED" | "QUOTA_EXHAUSTED" | "TRANSIENT_ERROR" | "AUTH_INVALID";
  usageUnits?: number;
  providerStatusCode?: number;
  providerErrorType?: string;
  providerMessage?: string;
  retryAfterSeconds?: number;
};

export type ReleaseUsageBody = {
  leaseId: string;
  submitted?: boolean;
};
