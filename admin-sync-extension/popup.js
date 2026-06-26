const AUTO_SYNC_ALARM = 'keeperAutoSync';
const AUTO_SYNC_PERIOD_MINUTES = 180;

void restoreFields();
attachKeeperControls();
attachSetupCodeControls();
attachSyncNowControl();

async function restoreFields() {
    const stored = await chrome.storage.local.get([
        'apiBaseUrl',
        'masterAccountId',
        'keeperKey',
        'autoSyncEnabled',
        'lastKeeperSyncAt',
        'lastKeeperSyncOk',
        'lastKeeperSyncMessage',
    ]);

    document.getElementById('autoSyncEnabled').checked = Boolean(stored.autoSyncEnabled);
    document.getElementById('syncNowBtn').disabled = !(stored.apiBaseUrl && stored.masterAccountId && stored.keeperKey);
    renderKeeperStatus(stored);
}

function attachSetupCodeControls() {
    document.getElementById('applySetupBtn').addEventListener('click', async () => {
        const raw = document.getElementById('setupCode').value.trim();
        const btn = document.getElementById('applySetupBtn');

        if (!raw) {
            showSetupStatus('Paste a setup code first.', 'error');
            return;
        }

        let payload;
        try {
            payload = decodeSetupCode(raw);
        } catch (err) {
            showSetupStatus(`Invalid setup code: ${err.message}`, 'error');
            return;
        }

        btn.disabled = true;
        showSetupStatus('Applying...', 'info');

        try {
            const apiOrigin = new URL(payload.apiBaseUrl).origin;
            const pattern = `${apiOrigin}/*`;

            // Skip the runtime permission prompt entirely when possible: it opens a
            // native Chrome dialog that steals focus from this popup, and MV3 action
            // popups close the instant they lose focus — killing this async function
            // mid-flight with no error shown (looks like "nothing happened" on click).
            // The production/local API origins are already granted via manifest.json's
            // host_permissions, so this only prompts for a genuinely unexpected origin.
            const alreadyGranted = await chrome.permissions.contains({ origins: [pattern] });
            if (!alreadyGranted) {
                const permissionGranted = await chrome.permissions.request({ origins: [pattern] });
                if (!permissionGranted) {
                    throw new Error('Required extension access permission was not granted.');
                }
            }

            await chrome.storage.local.set({
                apiBaseUrl: payload.apiBaseUrl,
                masterAccountId: payload.masterAccountId,
                keeperKey: payload.keeperKey,
            });

            document.getElementById('setupCode').value = '';
            document.getElementById('syncNowBtn').disabled = false;
            showSetupStatus('Setup code applied. You can now Sync Now or enable Auto-Sync.', 'success');
        } catch (err) {
            showSetupStatus(`Failed: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

function decodeSetupCode(raw) {
    // Defensive: strip any whitespace/newlines a copy-paste might introduce —
    // atob() rejects characters outside the base64 alphabet.
    const cleaned = raw.replace(/\s+/g, '');

    let json;
    try {
        json = atob(cleaned);
    } catch {
        throw new Error('not valid base64');
    }

    let payload;
    try {
        payload = JSON.parse(json);
    } catch {
        throw new Error('not valid JSON');
    }

    if (!payload || typeof payload !== 'object') {
        throw new Error('unexpected format');
    }

    for (const key of ['apiBaseUrl', 'masterAccountId', 'keeperKey']) {
        if (typeof payload[key] !== 'string' || !payload[key]) {
            throw new Error(`missing ${key}`);
        }
    }

    return {
        apiBaseUrl: payload.apiBaseUrl.trim().replace(/\/+$/, ''),
        masterAccountId: payload.masterAccountId.trim(),
        keeperKey: payload.keeperKey.trim(),
    };
}

function attachSyncNowControl() {
    document.getElementById('syncNowBtn').addEventListener('click', async () => {
        const btn = document.getElementById('syncNowBtn');
        btn.disabled = true;
        showStatus('Syncing...', 'info');

        try {
            const response = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
            if (response?.ok) {
                showStatus(response.message, 'success');
            } else {
                showStatus(response?.message || 'Sync failed.', 'error');
            }
        } catch (err) {
            showStatus(`Failed: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            const stored = await chrome.storage.local.get([
                'lastKeeperSyncAt',
                'lastKeeperSyncOk',
                'lastKeeperSyncMessage',
                'autoSyncEnabled',
            ]);
            renderKeeperStatus(stored);
        }
    });
}

function attachKeeperControls() {
    document.getElementById('autoSyncEnabled').addEventListener('change', async (event) => {
        const enabled = event.target.checked;
        await chrome.storage.local.set({ autoSyncEnabled: enabled });

        if (enabled) {
            chrome.alarms.create(AUTO_SYNC_ALARM, { periodInMinutes: AUTO_SYNC_PERIOD_MINUTES, delayInMinutes: 1 });
        } else {
            chrome.alarms.clear(AUTO_SYNC_ALARM);
        }
    });
}

function renderKeeperStatus(stored) {
    const el = document.getElementById('keeperStatus');
    if (!stored.lastKeeperSyncAt) {
        el.textContent = stored.autoSyncEnabled ? 'Waiting for first auto-sync run...' : '';
        return;
    }

    const time = new Date(stored.lastKeeperSyncAt).toLocaleString();
    el.textContent = `Last sync: ${time} — ${stored.lastKeeperSyncOk ? 'OK' : 'Failed'} (${stored.lastKeeperSyncMessage || ''})`;
    el.style.color = stored.lastKeeperSyncOk ? '#4ade80' : '#f87171';
}

function showSetupStatus(message, type) {
    const el = document.getElementById('setupStatus');
    el.textContent = message;
    el.className = type;
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = type;
}
