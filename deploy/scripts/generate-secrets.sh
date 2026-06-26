#!/usr/bin/env bash
set -euo pipefail

WORK_DIR="${WORK_DIR:-$(pwd)/.deploy-secrets}"
mkdir -p "${WORK_DIR}"
chmod 700 "${WORK_DIR}"

openssl genrsa -out "${WORK_DIR}/jwt_private.pem" 2048 >/dev/null 2>&1
openssl rsa -in "${WORK_DIR}/jwt_private.pem" -pubout -out "${WORK_DIR}/jwt_public.pem" >/dev/null 2>&1

echo "JWT_PRIVATE_KEY_BASE64="
base64 -w 0 "${WORK_DIR}/jwt_private.pem"
echo
echo
echo "JWT_PUBLIC_KEY_BASE64="
base64 -w 0 "${WORK_DIR}/jwt_public.pem"
echo
echo
echo "COOKIE_ENCRYPTION_KEY_BASE64="
openssl rand -base64 32
echo
echo "Private key files were written to ${WORK_DIR}. Keep them secret."
