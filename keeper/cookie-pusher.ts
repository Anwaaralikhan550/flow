import type { Cookie } from "playwright";

export async function pushCookies(
  backendUrl: string,
  masterAccountId: string,
  keeperKey: string,
  cookies: Cookie[],
): Promise<void> {
  const vaultData = JSON.stringify(cookies);

  const res = await fetch(
    `${backendUrl}/master-accounts/${masterAccountId}/keeper-sync`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keeperKey, vaultData }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `keeper-sync failed [${res.status}] for ${masterAccountId}: ${body}`,
    );
  }

  console.log(
    `[keeper] Pushed cookies for ${masterAccountId} → ${res.status} OK (${cookies.length} cookies)`,
  );
}
