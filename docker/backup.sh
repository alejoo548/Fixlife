#!/bin/sh
# Dump completo de MySQL, comprimido, con posición de binlog embebida
# (--master-data=2 vía MYSQLDUMP_OPTS) y rotación por retención.
set -eu

DB="${MYSQL_DATABASE:-fixlife_db}"
TS=$(date +%Y%m%d%H%M)
FILE="/backup/${TS}.${DB}.sql.gz"

echo "=> Backup started at $(date -u +"%Y-%m-%d %H:%M:%S")"
echo "==> Dumping database: ${DB}"
# shellcheck disable=SC2086
mysqldump -h "${MYSQL_HOST}" -P "${MYSQL_PORT:-3306}" -u "${MYSQL_USER}" -p"${MYSQL_PASS}" \
  ${MYSQLDUMP_OPTS:-} "${DB}" | gzip -"${GZIP_LEVEL:-6}" > "${FILE}"

echo "==> Creating symlink to latest backup: $(basename "${FILE}")"
ln -sf "$(basename "${FILE}")" "/backup/latest.${DB}.sql.gz"

MAX_BACKUPS="${MAX_BACKUPS:-14}"
cd /backup
ls -1t -- *".${DB}.sql.gz" 2>/dev/null | grep -v '^latest\.' | tail -n "+$((MAX_BACKUPS + 1))" | xargs -r rm -f

echo "=> Backup process finished at $(date -u +"%Y-%m-%d %H:%M:%S")"
