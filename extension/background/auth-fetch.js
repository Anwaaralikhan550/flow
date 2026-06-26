export function createAuthenticatedFetch({ fetchImpl, getToken, setToken, getApiBaseUrl }) {
  let refreshPromise = null;

  async function refreshAccessToken() {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const apiBaseUrl = await getApiBaseUrl();
        const response = await fetchImpl(`${apiBaseUrl}/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        const data = await readJson(response);
        if (!response.ok || typeof data?.accessToken !== "string") {
          throw createHttpError(response, data, "Refresh failed");
        }

        await setToken(data.accessToken);
        return data.accessToken;
      })().finally(() => {
        refreshPromise = null;
      });
    }

    return refreshPromise;
  }

  return async function authenticatedFetch(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      credentials: "include",
    });

    if (response.status !== 401 || !options.token || options.skipRefresh) {
      return response;
    }

    const currentToken = await getToken();
    const accessToken = currentToken !== options.token
      ? currentToken
      : await refreshAccessToken();

    return fetchImpl(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });
  };
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function createHttpError(response, data, fallback) {
  const error = new Error(data?.error?.message ?? `${fallback} with ${response.status}`);
  error.code = data?.error?.code;
  error.status = response.status;
  return error;
}
