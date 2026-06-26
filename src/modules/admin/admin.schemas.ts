export const createAdminSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      password: { type: "string", minLength: 12, maxLength: 256 },
      validDays: { type: "integer", minimum: 1, maximum: 3650 },
      creditsLimit: { type: "integer", minimum: 0, maximum: 10_000_000 },
    },
  },
} as const;

export const generateUserSchema = {
  body: {
    type: "object",
    required: ["plan"],
    additionalProperties: false,
    properties: {
      plan: { type: "string", enum: ["BASIC", "PRO", "ULTRA"] },
      password: { type: "string", minLength: 8, maxLength: 256 },
      validDays: { type: "integer", minimum: 1, maximum: 3650 },
      creditsLimit: { type: "integer", minimum: 1, maximum: 1_000_000 },
    },
  },
} as const;

const generatedUserSettingsResponse = {
  type: "object",
  properties: {
    validDays: { type: "integer", minimum: 1, maximum: 3650 },
  },
} as const;

export const getGeneratedUserSettingsSchema = {
  response: {
    200: generatedUserSettingsResponse,
  },
} as const;

export const updateGeneratedUserSettingsSchema = {
  body: {
    type: "object",
    required: ["validDays"],
    additionalProperties: false,
    properties: {
      validDays: { type: "integer", minimum: 1, maximum: 3650 },
    },
  },
  response: {
    200: generatedUserSettingsResponse,
  },
} as const;

export const upsertPlanConfigSchema = {
  body: {
    type: "object",
    required: ["plan", "creditsLimit"],
    additionalProperties: false,
    properties: {
      plan: { type: "string", enum: ["BASIC", "PRO", "ULTRA"] },
      creditsLimit: { type: "integer", minimum: 1, maximum: 1_000_000 },
      priceCents: { type: "integer", minimum: 0, maximum: 100_000_000 },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      durationDays: { type: "integer", minimum: 1, maximum: 3650 },
      isActive: { type: "boolean" },
    },
  },
} as const;

export const upsertAppConfigSchema = {
  body: {
    type: "object",
    required: ["key", "value"],
    additionalProperties: false,
    properties: {
      key: { type: "string", minLength: 2, maxLength: 64 },
      value: {},
    },
  },
} as const;

const masterAccountResponseProperties = {
  id: { type: "string" },
  provider: { type: "string" },
  email: { type: "string" },
  status: { type: "string" },
  dailyLimit: { type: "number" },
  remainingLimit: { type: "number" },
  cooldownUntil: { type: ["string", "null"] },
  lastUsedAt: { type: ["string", "null"] },
  hasVaultData: { type: "boolean" },
  vaultVersion: { type: "number" },
  vaultHealth: { type: "string" },
  lastVaultSyncAt: { type: ["string", "null"] },
  createdAt: { type: "string" },
  updatedAt: { type: "string" },
} as const;

export const listMasterAccountsSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        accounts: {
          type: "array",
          items: {
            type: "object",
            properties: masterAccountResponseProperties,
          },
        },
      },
    },
  },
} as const;

export const addMasterAccountSchema = {
  body: {
    type: "object",
    required: ["provider", "email", "dailyLimit"],
    additionalProperties: false,
    properties: {
      provider: { type: "string", minLength: 2, maxLength: 64 },
      email: { type: "string", format: "email", maxLength: 254 },
      vaultData: { type: ["string", "null"] },
      dailyLimit: { type: "integer", minimum: 1, maximum: 1_000_000 },
      remainingLimit: { type: "integer", minimum: 0, maximum: 1_000_000 },
      status: { type: "string", enum: ["ACTIVE", "COOLING_DOWN", "EXHAUSTED", "AUTH_INVALID", "REQUIRES_SYNC", "DISABLED"] },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        account: {
          type: "object",
          properties: masterAccountResponseProperties,
        },
      },
    },
  },
} as const;

export const updateMasterAccountVaultDataSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  body: {
    type: "object",
    required: ["vaultData", "syncCode"],
    additionalProperties: false,
    properties: {
      vaultData: { type: ["string", "null"] },
      syncCode: { type: "string", minLength: 12, maxLength: 24 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        account: {
          type: "object",
          properties: masterAccountResponseProperties,
        },
      },
    },
  },
} as const;

export const updateMasterAccountStatusSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  body: {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["ACTIVE", "DISABLED"] },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        account: {
          type: "object",
          properties: masterAccountResponseProperties,
        },
      },
    },
  },
} as const;

export const deleteMasterAccountSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        deleted: { type: "boolean" },
        account: {
          type: "object",
          properties: masterAccountResponseProperties,
        },
      },
    },
  },
} as const;

export const generateKeeperKeySchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        keeperKey: { type: "string" },
      },
    },
  },
} as const;

export const generateSyncCodeSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        code: { type: "string" },
        expiresAt: { type: "string" },
      },
    },
  },
} as const;

const userResponseProperties = {
  id: { type: "string" },
  email: { type: "string" },
  role: { type: "string" },
  plan: { type: "string" },
  validUntil: { type: "string" },
  isManuallyDisabled: { type: "boolean" },
  createdByAdminId: { type: ["string", "null"] },
  creditsLimit: { type: "number" },
  creditsUsed: { type: "number" },
  createdAt: { type: "string" },
  status: { type: "string" },
  accessStatus: { type: "string" },
  systemExpired: { type: "boolean" },
  manualDisable: { type: "boolean" },
  daysRemaining: { type: "number" },
} as const;

export const updateUserPlanSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  body: {
    type: "object",
    required: ["plan"],
    additionalProperties: false,
    properties: {
      plan: { type: "string", enum: ["BASIC", "PRO", "ULTRA"] },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: userResponseProperties,
        },
      },
    },
  },
} as const;

export const listAdminsSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        admins: {
          type: "array",
          items: {
            type: "object",
            properties: userResponseProperties,
          },
        },
      },
    },
  },
} as const;

export const salesReportSchema = {
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          adminId: { type: "string" },
          adminName: { type: "string" },
          basicCount: { type: "number" },
          proCount: { type: "number" },
          ultraCount: { type: "number" },
        },
      },
    },
  },
} as const;

export const updateAdminStatusSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  body: {
    type: "object",
    required: ["isManuallyDisabled"],
    additionalProperties: false,
    properties: {
      isManuallyDisabled: { type: "boolean" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        admin: {
          type: "object",
          properties: userResponseProperties,
        },
      },
    },
  },
} as const;

export const updateUserStatusSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  body: {
    type: "object",
    required: ["isManuallyDisabled"],
    additionalProperties: false,
    properties: {
      isManuallyDisabled: { type: "boolean" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: userResponseProperties,
        },
      },
    },
  },
} as const;

export const deleteUserSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        deleted: { type: "boolean" },
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            role: { type: "string" },
            createdByAdminId: { type: ["string", "null"] },
          },
        },
      },
    },
  },
} as const;

export type CreateAdminBody = {
  email: string;
  password: string;
  validDays?: number;
  creditsLimit?: number;
};

export type GenerateUserBody = {
  plan: "BASIC" | "PRO" | "ULTRA";
  password?: string;
  validDays?: number;
  creditsLimit?: number;
};

export type UpdateGeneratedUserSettingsBody = {
  validDays: number;
};

export type UpsertPlanConfigBody = {
  plan: "BASIC" | "PRO" | "ULTRA";
  creditsLimit: number;
  priceCents?: number;
  currency?: string;
  durationDays?: number;
  isActive?: boolean;
};

export type UpsertAppConfigBody = {
  key: string;
  value: unknown;
};

export type AddMasterAccountBody = {
  provider: string;
  email: string;
  vaultData?: string | null;
  dailyLimit: number;
  remainingLimit?: number;
  status?: "ACTIVE" | "COOLING_DOWN" | "EXHAUSTED" | "AUTH_INVALID" | "REQUIRES_SYNC" | "DISABLED";
};

export type UpdateMasterAccountVaultDataBody = {
  vaultData: string | null;
  syncCode: string;
};

export type UpdateMasterAccountStatusBody = {
  status: "ACTIVE" | "DISABLED";
};

export type UpdateUserPlanBody = {
  plan: "BASIC" | "PRO" | "ULTRA";
};

export type UpdateAdminStatusBody = {
  isManuallyDisabled: boolean;
};

export type UpdateUserStatusBody = {
  isManuallyDisabled: boolean;
};
