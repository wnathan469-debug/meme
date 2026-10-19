#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${BACKUP_PASSWORD_FILE:?}" "${BACKUP_CERT_FILE:?}"
backup_dir="${BACKUP_DIR:-/backups}"
backup_interval="${BACKUP_INTERVAL_SECONDS:-21600}"
[[ "$backup_interval" =~ ^[0-9]+$ && "$backup_interval" -ge 60 ]] || exit 1
mkdir -p "$backup_dir"
export PGPASSWORD
PGPASSWORD="$(cat "$BACKUP_PASSWORD_FILE")"
backup_tmp=''
trap '[[ -z "$backup_tmp" ]] || rm -f "$backup_tmp"' EXIT
while true; do
  # mktemp + atomic rename: neither a failed dump nor partial encryption is published.
  backup_tmp="$(mktemp "$backup_dir/.partial.XXXXXXXX")"
  if ! pg_dump --format=custom --no-owner --no-acl 2>/dev/null |
    openssl cms -encrypt -aes-256-gcm -binary -outform DER \
      -out "$backup_tmp" "$BACKUP_CERT_FILE" 2>/dev/null; then
    echo '{"service":"backup","status":"alert","code":"BACKUP_FAILED"}' >&2
    exit 1
  fi
  backup_name="memeradar-$(date -u +%Y%m%dT%H%M%SZ)-$(basename "$backup_tmp").cms"
  mv "$backup_tmp" "$backup_dir/$backup_name"
  backup_tmp=''
  echo '{"service":"backup","status":"saved_encrypted","offsite":false}'
  [[ "${BACKUP_ONCE:-false}" != true ]] || break
  sleep "$backup_interval"
done
# Deliberately no automatic deletion: retention follows verified offsite copying.
