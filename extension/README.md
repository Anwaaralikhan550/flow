# Session License Bridge Extension

Manifest V3 Chrome extension for the safe backend in this workspace.

It supports:

- Login with backend-generated virtual emails.
- Stable client fingerprint submission during login.
- JWT-backed calls to `/client/config` and `/session/lease-account`.
- Client feature policy display and local first-party UI gating.

It intentionally does not:

- Intercept Google or VEO requests.
- Inject third-party cookies.
- Modify Google/VEO browser sessions or UI.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the `extension` folder from this project.

## Configure

The popup defaults to `https://api.vidgen.fun`. Change the backend URL in the popup before logging in only if you deploy the API at another origin.

If your backend is deployed at a different origin, update `host_permissions` in `manifest.json` before loading the extension.
