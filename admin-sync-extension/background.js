const TRUSTED_COOKIE_URLS = ['https://labs.google/', 'https://labs.google.com/'];
// Confirmed via real-browser testing: session-token alone is sufficient for both
// page load and video generation — csrf-token/callback-url are not load-bearing.
const NEXT_AUTH_COOKIE_NAMES = [
    '__Secure-next-auth.session-token',
];
const AUTO_SYNC_ALARM = 'keeperAutoSync';

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_SYNC_ALARM) {
        void runKeeperSyncIfEnabled();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SYNC_NOW') {
        runKeeperSync()
            .then(sendResponse)
            .catch((err) => sendResponse({ ok: false, message: err?.message ?? 'Sync failed unexpectedly.' }));
        return true;
    }
});

async function runKeeperSyncIfEnabled() {
    const { autoSyncEnabled } = await chrome.storage.local.get(['autoSyncEnabled']);
    if (!autoSyncEnabled) {
        return;
    }
    await runKeeperSync();
}

async function runKeeperSync() {
    const stored = await chrome.storage.local.get(['apiBaseUrl', 'masterAccountId', 'keeperKey']);

    if (!stored.apiBaseUrl || !stored.masterAccountId || !stored.keeperKey) {
        const message = 'Setup code has not been applied yet.';
        await recordKeeperRun(false, message);
        return { ok: false, message };
    }

    try {
        const { cookies, summary } = await collectVaultCookies();

        if (cookies.length === 0) {
            const message = 'No platform cookies found. Is the keeper profile still logged in?';
            await recordKeeperRun(false, message);
            return { ok: false, message };
        }

        const apiBaseUrl = stored.apiBaseUrl.trim().replace(/\/+$/, '');
        const endpoint = `${apiBaseUrl}/master-accounts/${stored.masterAccountId}/keeper-sync`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keeperKey: stored.keeperKey, vaultData: JSON.stringify(cookies) }),
        });

        if (response.ok) {
            const message = `${cookies.length} cookies synced (${summary.foundNames.length}/${NEXT_AUTH_COOKIE_NAMES.length} NextAuth cookies)`;
            await recordKeeperRun(true, message);
            return { ok: true, message };
        } else {
            const errorText = await response.text();
            const message = errorText.slice(0, 200) || `HTTP ${response.status}`;
            await recordKeeperRun(false, message);
            return { ok: false, message };
        }
    } catch (err) {
        await recordKeeperRun(false, err.message);
        return { ok: false, message: err.message };
    }
}

async function collectVaultCookies() {
    const workspaceResults = await Promise.all(
        TRUSTED_COOKIE_URLS.map((url) => chrome.cookies.getAll({ url }))
    );
    const workspaceCookies = workspaceResults.flat().filter((c) => NEXT_AUTH_COOKIE_NAMES.includes(c.name));
    const summary = validateCookieSources(workspaceCookies);
    const seen = new Map();
    for (const cookie of workspaceCookies) {
        const partitionKey = cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : '';
        const key = [cookie.storeId || '', partitionKey, cookie.domain || '', cookie.path || '', cookie.name || ''].join('|');
        seen.set(key, cookie);
    }

    return { cookies: [...seen.values()], summary };
}

function validateCookieSources(cookies) {
    const foundNames = new Set(cookies.filter((c) => c?.name && typeof c.value === 'string').map((c) => c.name));
    const missingNames = NEXT_AUTH_COOKIE_NAMES.filter((name) => !foundNames.has(name));

    if (missingNames.length > 0) {
        throw new Error('Missing NextAuth cookies: ' + missingNames.join(', ') + '. Open the target workspace in keeper profile and sync again.');
    }

    return { foundNames: [...foundNames] };
}

async function recordKeeperRun(success, message) {
    await chrome.storage.local.set({
        lastKeeperSyncAt: new Date().toISOString(),
        lastKeeperSyncOk: success,
        lastKeeperSyncMessage: message,
    });
}
