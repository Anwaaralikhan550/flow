import crypto from "node:crypto";
import type { PlanType, Role } from "@prisma/client";

type ClientConfig = {
  version: number;
  role: Role;
  plan: PlanType;
  allowedActions: string[];
  creditPolicy: {
    generationLoopCredits: number;
    blockedHighCreditParameters: number[];
    maxPromptLength: number;
  };
};

const configVersion = 1;

const planPolicies: Record<PlanType, ClientConfig["creditPolicy"]> = {
  BASIC: {
    generationLoopCredits: 20,
    blockedHighCreditParameters: [100],
    maxPromptLength: 1500,
  },
  PRO: {
    generationLoopCredits: 20,
    blockedHighCreditParameters: [],
    maxPromptLength: 3000,
  },
  ULTRA: {
    generationLoopCredits: 20,
    blockedHighCreditParameters: [],
    maxPromptLength: 6000,
  },
};

export class ClientConfigService {
  getConfig(params: { role: Role; plan: PlanType }): ClientConfig {
    return {
      version: configVersion,
      role: params.role,
      plan: params.plan,
      allowedActions: ["SESSION_LEASE", "USAGE_REPORT", "CLIENT_GENERATE_20_CREDIT_LOOP"],
      creditPolicy: planPolicies[params.plan],
    };
  }

  hashConfig(config: ClientConfig) {
    return crypto.createHash("sha256").update(JSON.stringify(config)).digest("base64url");
  }

  getConfigWithHash(params: { role: Role; plan: PlanType }) {
    const config = this.getConfig(params);
    return {
      config,
      configHash: this.hashConfig(config),
    };
  }
}
