#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/scripts/06-install-cleanup-cron.sh"
  exit 1
fi

APP_DIR="${APP_DIR:-/var/www/vidgen}"
APP_USER="${APP_USER:-$(stat -c '%U' "${APP_DIR}")}"
CRON_FILE="/etc/cron.d/vidgen-cleanup"

cat > "${CRON_FILE}" <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 3 * * * ${APP_USER} cd ${APP_DIR} && npm run cleanup:customers -- --execute >> /var/log/vidgen-cleanup.log 2>&1
CRON

chmod 644 "${CRON_FILE}"
touch /var/log/vidgen-cleanup.log
chown "${APP_USER}:${APP_USER}" /var/log/vidgen-cleanup.log

echo "Cleanup cron installed at ${CRON_FILE}."
