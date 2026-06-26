# Flow Admin Vault Sync Extension

This is a standalone extension for Super Admins to sync live session cookies from a premium master account to the backend vault.

## Setup Instructions

1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (toggle in the top right).
3.  Click **Load unpacked** and select this `admin-sync-extension` folder.

## How to Sync

1.  **Open the workspace**: Ensure you are logged into the target premium master account in the same Chrome profile where this extension is installed, and keep the workspace page active.
2.  **Get Master Account ID**: Find the UUID of the Master Account you want to update from the Admin Panel.
3.  **Get Admin Access Token**: Use the active Super Admin JWT from the Admin Panel session.
4.  **Get Sync Code**: Generate a valid sync authorization code from the Admin Panel.
5.  **Sync**:
    *   Click the extension icon.
    *   Enter the **Master Account ID**.
    *   Enter the **Admin Access Token**.
    *   Enter the **Sync Authorization Code**.
    *   Click **Sync Cookies to Backend**.

## Verification

### 1. UI Check
The extension will display a success message: `Success! Vault data updated for [email]`.

### 2. Database Check
You can verify the data was saved by checking the `MasterAccount` table in the database:
```sql
SELECT "email", "vaultData" FROM "MasterAccount" WHERE "id" = 'YOUR_UUID_HERE';
```
The `vaultData` column should contain a JSON array of cookies.

### 3. API Test (Manual)
You can test the backend endpoint directly using `curl`:
```bash
curl -X PATCH https://api.vidgen.fun/admin/master-accounts/YOUR_UUID/vault-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN" \
  -d '{"vaultData": "[{\"name\":\"test\",\"value\":\"cookie\"}]", "syncCode": "YOUR_SYNC_CODE"}'
```

## Security Note
This extension is for administrative use only. Keep access tokens, sync codes, and master-account browser profiles secure.
