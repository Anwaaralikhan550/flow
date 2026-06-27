import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The extension module is plain JavaScript for direct Chrome loading.
import { createAuthenticatedFetch } from "../extension/background/auth-fetch.js";

function response(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function textResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe("extension silent refresh", () => {
  it("refreshes after a 401, stores the new token, and retries the original request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401, { error: { code: "INVALID_TOKEN" } }))
      .mockResolvedValueOnce(response(200, { accessToken: "new-access-token", expiresIn: 86_400 }))
      .mockResolvedValueOnce(response(200, { ok: true }));
    const setToken = vi.fn().mockResolvedValue(undefined);
    const authenticatedFetch = createAuthenticatedFetch({
      fetchImpl,
      getToken: vi.fn().mockResolvedValue("expired-access-token"),
      setToken,
      getApiBaseUrl: vi.fn().mockResolvedValue("https://api.example.com"),
    });

    const result = await authenticatedFetch("https://api.example.com/client/dashboard", {
      method: "GET",
      headers: { Authorization: "Bearer expired-access-token" },
      token: "expired-access-token",
    });

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1]).toEqual([
      "https://api.example.com/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    ]);
    expect(setToken).toHaveBeenCalledWith("new-access-token");
    expect(fetchImpl.mock.calls[2]).toEqual([
      "https://api.example.com/client/dashboard",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-access-token",
        }),
        credentials: "include",
      }),
    ]);
  });

  it("uses one refresh call for multiple simultaneous 401 responses", async () => {
    let storedToken = "expired-access-token";
    let releaseRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const fetchImpl = vi.fn().mockImplementation(async (url: string, options: { headers?: Record<string, string> }) => {
      if (url.endsWith("/auth/refresh")) {
        await refreshGate;
        return response(200, { accessToken: "new-access-token", expiresIn: 86_400 });
      }

      return options.headers?.Authorization === "Bearer new-access-token"
        ? response(200, { ok: true })
        : response(401, { error: { code: "INVALID_TOKEN" } });
    });
    const authenticatedFetch = createAuthenticatedFetch({
      fetchImpl,
      getToken: vi.fn().mockImplementation(async () => storedToken),
      setToken: vi.fn().mockImplementation(async (token: string) => {
        storedToken = token;
      }),
      getApiBaseUrl: vi.fn().mockResolvedValue("https://api.example.com"),
    });
    const requestOptions = {
      method: "GET",
      headers: { Authorization: "Bearer expired-access-token" },
      token: "expired-access-token",
    };

    const requests = [
      authenticatedFetch("https://api.example.com/client/config", requestOptions),
      authenticatedFetch("https://api.example.com/client/dashboard", requestOptions),
      authenticatedFetch("https://api.example.com/session/lease-account", requestOptions),
    ];
    await vi.waitFor(() => {
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
    });
    releaseRefresh?.();

    const results = await Promise.all(requests);

    expect(results.map((result: { status: number }) => result.status)).toEqual([200, 200, 200]);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("retries a delayed stale 401 with the already refreshed token", async () => {
    let storedToken = "expired-access-token";
    let releaseDelayedRequest: (() => void) | undefined;
    const delayedRequestGate = new Promise<void>((resolve) => {
      releaseDelayedRequest = resolve;
    });
    let staleRequestCount = 0;
    const fetchImpl = vi.fn().mockImplementation(async (url: string, options: { headers?: Record<string, string> }) => {
      if (url.endsWith("/auth/refresh")) {
        return response(200, { accessToken: "new-access-token", expiresIn: 86_400 });
      }

      if (options.headers?.Authorization === "Bearer new-access-token") {
        return response(200, { ok: true });
      }

      staleRequestCount += 1;
      if (staleRequestCount === 2) {
        await delayedRequestGate;
      }
      return response(401, { error: { code: "INVALID_TOKEN" } });
    });
    const authenticatedFetch = createAuthenticatedFetch({
      fetchImpl,
      getToken: vi.fn().mockImplementation(async () => storedToken),
      setToken: vi.fn().mockImplementation(async (token: string) => {
        storedToken = token;
      }),
      getApiBaseUrl: vi.fn().mockResolvedValue("https://api.example.com"),
    });
    const requestOptions = {
      method: "GET",
      headers: { Authorization: "Bearer expired-access-token" },
      token: "expired-access-token",
    };

    const firstRequest = authenticatedFetch("https://api.example.com/client/config", requestOptions);
    const delayedRequest = authenticatedFetch("https://api.example.com/client/dashboard", requestOptions);
    await expect(firstRequest).resolves.toMatchObject({ status: 200 });
    releaseDelayedRequest?.();
    await expect(delayedRequest).resolves.toMatchObject({ status: 200 });

    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("handles non-JSON refresh failures without throwing a parser error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401, { error: { code: "INVALID_TOKEN" } }))
      .mockResolvedValueOnce(textResponse(502, "<html>bad gateway</html>"));
    const authenticatedFetch = createAuthenticatedFetch({
      fetchImpl,
      getToken: vi.fn().mockResolvedValue("expired-access-token"),
      setToken: vi.fn().mockResolvedValue(undefined),
      getApiBaseUrl: vi.fn().mockResolvedValue("https://api.example.com"),
    });

    await expect(
      authenticatedFetch("https://api.example.com/client/dashboard", {
        method: "GET",
        headers: { Authorization: "Bearer expired-access-token" },
        token: "expired-access-token",
      }),
    ).rejects.toMatchObject({ message: "Refresh failed with 502", status: 502 });
  });
});
