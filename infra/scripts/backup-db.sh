#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker-compose.prod.yml}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT="$BACKUP_DIR/clinicsys-${STAMP}.sql.gz"

echo "Backing up ${POSTGRES_DB} to ${OUTPUT}"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
  | gzip > "$OUTPUT"

find "$BACKUP_DIR" -name 'clinicsys-*.sql.gz' -mtime +"$RETAIN_DAYS" -delete
echo "Backup complete. Retaining ${RETAIN_DAYS} days in ${BACKUP_DIR}."
