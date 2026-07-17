#!/bin/sh
set -eu

CRON_LINE="${CRON_TIME:-0 3 * * *} root /backup.sh >> /var/log/mysql_backup.log 2>&1"
echo "${CRON_LINE}" > /etc/cron.d/mysql-backup
chmod 0644 /etc/cron.d/mysql-backup
touch /var/log/mysql_backup.log

if [ "${INIT_BACKUP:-0}" = "1" ]; then
  /backup.sh || true
fi

exec crond -n -x sch,proc
