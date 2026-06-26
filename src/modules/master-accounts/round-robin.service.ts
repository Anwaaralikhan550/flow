import type { MasterAccount, PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { MasterAccountRepository } from "./master-account.repository.js";

const ACTIVE_LIST_KEY = "master:active:list";
const RR_INDEX_KEY = "master:rr:index";
const RELEASE_REUSE_BUFFER_SECONDS = 1;

function hasUsableVaultData(vaultData?: string | null) {
  if (!vaultData?.trim()) {
    return false;
  }

  try {
    const parsed = JSON.parse(vaultData);
    const cookies = Array.isArray(parsed) ? parsed : [parsed];

    return cookies.some((cookie) => {
      if (!cookie || typeof cookie !== "object") {
        return false;
      }

      const candidate = cookie as { name?: unknown; value?: unknown };
      return typeof candidate.name === "string" && candidate.name.length > 0 && typeof candidate.value === "string";
    });
  } catch {
    return false;
  }
}

export class RoundRobinService {
  private readonly repository: MasterAccountRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.repository = new MasterAccountRepository(prisma);
  }

  async nextAccount(): Promise<MasterAccount | null> {
    let ids = await this.redis.lrange(ACTIVE_LIST_KEY, 0, -1);
    if (ids.length === 0) {
      ids = await this.reloadActiveList();
    }

    if (ids.length === 0) {
      return null;
    }

    for (let attempt = 0; attempt < ids.length; attempt += 1) {
      const nextIndex = await this.redis.incr(RR_INDEX_KEY);
      const id = ids[nextIndex % ids.length];
      if (!id) {
        continue;
      }

      const coolingDown = await this.redis.exists(`master:${id}:cooldown`);
      if (coolingDown) {
        continue;
      }

      const inflightJobs = await this.countInflightJobs(id);
      if (inflightJobs >= env.PROVIDER_INFLIGHT_JOB_CAPACITY) {
        continue;
      }

      const locked = await this.redis.set(`master:${id}:lock`, "1", "EX", env.SESSION_PREPARE_LOCK_SECONDS, "NX");
      if (!locked) {
        continue;
      }

      const account = await this.repository.findById(id);
      if (!account || account.status !== "ACTIVE" || account.remainingLimit <= 0 || !account.encryptedCookie || !account.cookieNonce) {
        await this.redis.lrem(ACTIVE_LIST_KEY, 0, id);
        await this.redis.del(`master:${id}:lock`);
        continue;
      }

      await this.redis.set(`master:${id}:remaining`, account.remainingLimit, "EX", 3600, "NX");
      return account;
    }

    return null;
  }

  async reloadActiveList() {
    await this.repository.activateExpiredCooldowns();
    const accounts = await this.repository.findLeasableAccounts();
    const ids = accounts.map((account) => account.id);

    await this.redis.del(ACTIVE_LIST_KEY);
    if (ids.length > 0) {
      await this.redis.rpush(ACTIVE_LIST_KEY, ...ids);
      await this.redis.expire(ACTIVE_LIST_KEY, 60);
    }

    return ids;
  }

  async removeFromActiveList(id: string) {
    await this.redis.lrem(ACTIVE_LIST_KEY, 0, id);
  }

  async markInflightJob(masterAccountId: string, leaseId: string) {
    const key = this.inflightJobsKey(masterAccountId);
    await this.pruneInflightJobs(masterAccountId);
    await this.redis.zadd(key, Date.now() + env.PROVIDER_INFLIGHT_TTL_SECONDS * 1000, leaseId);
    await this.redis.expire(key, env.PROVIDER_INFLIGHT_TTL_SECONDS);
  }

  async clearInflightJob(masterAccountId: string, leaseId: string) {
    await this.redis.zrem(this.inflightJobsKey(masterAccountId), leaseId);
  }

  async bufferReleasedLock(masterAccountId: string) {
    await this.redis.expire(`master:${masterAccountId}:lock`, RELEASE_REUSE_BUFFER_SECONDS);
  }

  private async countInflightJobs(masterAccountId: string) {
    await this.pruneInflightJobs(masterAccountId);
    return this.redis.zcard(this.inflightJobsKey(masterAccountId));
  }

  private async pruneInflightJobs(masterAccountId: string) {
    await this.redis.zremrangebyscore(this.inflightJobsKey(masterAccountId), 0, Date.now());
  }

  private inflightJobsKey(masterAccountId: string) {
    return `master:${masterAccountId}:inflight_jobs`;
  }
}
