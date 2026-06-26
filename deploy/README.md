# Vidgen Production Deploy

This folder contains the repeatable VPS deployment kit for `vidgen.fun`.

## Production Layout

- `https://vidgen.fun` -> Next landing app on `127.0.0.1:3001`
- `https://admin.vidgen.fun/admin` -> Next admin app on `127.0.0.1:3001`
- `https://api.vidgen.fun` -> Fastify backend on `127.0.0.1:3000`
- PostgreSQL and Redis run locally on the VPS and are not exposed publicly.
- PM2 keeps the backend and landing app online.
- Nginx terminates HTTPS and proxies traffic.

## Order Of Operations

1. Point DNS A records to the VPS IP:
   - `vidgen.fun`
   - `www.vidgen.fun`
   - `api.vidgen.fun`
   - `admin.vidgen.fun`
2. Run `deploy/scripts/01-provision-ubuntu.sh`.
3. Upload/copy the project to `/var/www/vidgen`.
4. Create `/var/www/vidgen/.env` from `deploy/env.production.example`.
5. Run `deploy/scripts/generate-secrets.sh` and paste values into `.env`.
6. Create the Postgres database/user with `deploy/scripts/create-postgres-db.sh`.
7. Run `deploy/scripts/02-deploy-app.sh`.
8. Run `deploy/scripts/03-configure-nginx.sh`.
9. Run `deploy/scripts/04-enable-ssl.sh`.
10. Install cleanup cron with `deploy/scripts/06-install-cleanup-cron.sh`.
11. Run `deploy/scripts/05-verify-live.sh`.

Never commit the real `.env` file or generated private keys.
