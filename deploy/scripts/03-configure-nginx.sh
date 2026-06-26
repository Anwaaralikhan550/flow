#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/scripts/03-configure-nginx.sh"
  exit 1
fi

APP_DIR="${APP_DIR:-/var/www/vidgen}"
CONF_SRC="${APP_DIR}/deploy/nginx/vidgen.conf"
CONF_DEST="/etc/nginx/sites-available/vidgen"

if [[ ! -f "${CONF_SRC}" ]]; then
  echo "Missing nginx config template: ${CONF_SRC}"
  exit 1
fi

cp "${CONF_SRC}" "${CONF_DEST}"
ln -sfn "${CONF_DEST}" /etc/nginx/sites-enabled/vidgen
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "Nginx configured."
