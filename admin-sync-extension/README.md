# Flow Admin Vault Sync Extension

Standalone keeper extension for Super Admins to sync live master-account session cookies into the backend vault.

## Setup

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked and select this `admin-sync-extension` folder.
4. In the admin panel, open the target master account and generate a Setup Code.
5. Open this extension popup, paste the Setup Code, and click Apply Setup.

## Sync Flow

1. Use a dedicated keeper Chrome profile.
2. Log that profile into the target premium master account on `https://labs.google/` or `https://labs.google.com/`.
3. Apply the Setup Code once; it stores `apiBaseUrl`, `masterAccountId`, and `keeperKey` locally.
4. Click Sync Now, or enable Auto-Sync for the scheduled keeper alarm.
5. The extension collects the required NextAuth cookies from fixed trusted origins and posts them to `/master-accounts/:id/keeper-sync`.

## Verification

- The popup shows the last sync status and timestamp.
- The admin panel should show vault health as `COMPLETE`, an incremented vault version, and a recent sync timestamp.
- The backend stores encrypted session material; plaintext cookie JSON is not kept in `MasterAccount.vaultData`.

## Security Note

This extension is for administrative keeper profiles only. Keep setup codes, keeper keys, and master-account browser profiles restricted to trusted operators.
