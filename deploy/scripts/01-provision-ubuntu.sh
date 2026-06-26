#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/scripts/01-provision-ubuntu.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git unzip nginx postgresql postgresql-contrib redis-server openssl build-essential ufw fail2ban certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

systemctl enable --now postgresql
systemctl enable --now redis-server
systemctl enable --now nginx
systemctl enable --now fail2ban

if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "Provision complete."
echo "Node: $(node -v)"
echo "npm: $(npm -v)"
echo "PM2: $(pm2 -v)"
redis-cli ping
