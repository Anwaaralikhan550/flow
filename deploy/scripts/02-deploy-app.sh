#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/vidgen}"

cd "${APP_DIR}"

if [[ ! -f ".env" ]]; then
  echo "Missing ${APP_DIR}/.env. Copy deploy/env.production.example and fill real values first."
  exit 1
fi

if grep -q "CHANGE_ME" .env; then
  echo ".env still contains CHANGE_ME placeholders."
  exit 1
fi

npm ci
npx prisma generate
npx prisma migrate deploy

if [[ "${RUN_SEED:-0}" == "1" ]]; then
  npm run seed
fi

npm run build

cd "${APP_DIR}/landing"
npm ci
npm run build
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static
if [[ -d public ]]; then
  rm -rf .next/standalone/public
  cp -R public .next/standalone/public
fi

cd "${APP_DIR}"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "Application deployed."
pm2 status
