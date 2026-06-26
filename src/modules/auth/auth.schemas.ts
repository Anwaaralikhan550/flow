export const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password", "fingerprint_id"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      password: { type: "string", minLength: 8, maxLength: 256 },
      fingerprint_id: { type: "string", minLength: 16, maxLength: 256 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        tokenType: { type: "string" },
        expiresIn: { type: "number" },
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            role: { type: "string" },
            plan: { type: "string" },
            status: { type: "string" },
            accessStatus: { type: "string" },
            validUntil: { type: "string" },
            isManuallyDisabled: { type: "boolean" },
            systemExpired: { type: "boolean" },
            manualDisable: { type: "boolean" },
            daysRemaining: { type: "number" },
            creditsLimit: { type: "number" },
            creditsUsed: { type: "number" },
          },
        },
      },
    },
  },
} as const;

export const refreshSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        tokenType: { type: "string" },
        expiresIn: { type: "number" },
      },
    },
  },
} as const;

export type LoginBody = {
  email: string;
  password: string;
  fingerprint_id: string;
};
