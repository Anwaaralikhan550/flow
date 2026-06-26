#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/scripts/04-enable-ssl.sh"
  exit 1
fi

EMAIL="${CERTBOT_EMAIL:-admin@vidgen.fun}"

certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --email "${EMAIL}" \
  -d vidgen.fun \
  -d www.vidgen.fun \
  -d api.vidgen.fun \
  -d admin.vidgen.fun

systemctl reload nginx
certbot renew --dry-run

echo "SSL enabled."
