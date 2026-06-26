#!/usr/bin/env bash
set -euo pipefail

check_url() {
  local url="$1"
  echo "Checking ${url}"
  curl -fsSIL "${url}" | head -n 1
}

pm2 status
redis-cli ping
check_url "https://vidgen.fun"
check_url "https://admin.vidgen.fun/admin"
check_url "https://api.vidgen.fun/health"

echo "Live verification completed."
