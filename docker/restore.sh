#!/usr/bin/env bash
# Restaura un dump completo de MySQL y, opcionalmente, reproduce el binlog
# hasta un punto exacto en el tiempo (PITR).
#
# Uso:
#   ./docker/restore.sh <archivo_dump.sql.gz> ["YYYY-MM-DD HH:MM:SS"]
#
# Sin el segundo argumento, solo restaura el dump completo (último backup diario).
# Con el segundo argumento, además reproduce los binlogs generados después del
# dump hasta ese instante, permitiendo recuperar el estado justo antes de un
# borrado accidental.
#
# Variables de entorno esperadas (mismas que usa el backend/docker-compose):
#   MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, COMPOSE_FILE (default docker-compose.yml)

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <archivo_dump.sql.gz> [\"YYYY-MM-DD HH:MM:SS\"]" >&2
  exit 1
fi

DUMP_FILE="$1"
UNTIL_DATETIME="${2:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_NAME="${MYSQL_DATABASE:-fixlife_db}"

if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo "Error: exportá MYSQL_ROOT_PASSWORD antes de correr este script." >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "Error: no existe el archivo $DUMP_FILE" >&2
  exit 1
fi

echo "==> 1) Restaurando dump completo: $DUMP_FILE"
gunzip -c "$DUMP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T mysql \
  mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${DB_NAME}"

if [ -n "$UNTIL_DATETIME" ]; then
  echo "==> 2) Extrayendo posición de binlog embebida en el dump (--master-data=2)"
  START_LOG=$(zgrep -m1 -oE "MASTER_LOG_FILE='[^']+'" "$DUMP_FILE" | sed "s/MASTER_LOG_FILE='//;s/'//")
  START_POS=$(zgrep -m1 -oE "MASTER_LOG_POS=[0-9]+" "$DUMP_FILE" | sed 's/MASTER_LOG_POS=//')

  if [ -z "$START_LOG" ] || [ -z "$START_POS" ]; then
    echo "Error: el dump no tiene posición de binlog embebida (¿se generó con --master-data=2?)." >&2
    exit 1
  fi
  echo "    Punto de partida: $START_LOG @ $START_POS"

  # mysqlbinlog no viene en la imagen del servicio "mysql" (server-minimal);
  # el servicio "mysql-backup" monta el volumen de datos como solo-lectura y
  # sí tiene mysqlbinlog (ver docker/Dockerfile.mysql-backup).
  echo "==> 3) Listando binlogs disponibles desde $START_LOG en adelante"
  BINLOGS=$(docker compose -f "$COMPOSE_FILE" exec -T mysql-backup sh -c \
    "ls /var/lib/mysql/mysql-bin.* 2>/dev/null | grep -v '\.index'" \
    | awk -F/ '{print $NF}' | sort | awk -v start="$START_LOG" '$0 >= start')

  if [ -z "$BINLOGS" ]; then
    echo "Error: no se encontraron archivos de binlog desde $START_LOG. ¿Ya expiraron (binlog-expire-logs-seconds)?" >&2
    exit 1
  fi
  echo "    Binlogs a reproducir: $BINLOGS"

  echo "==> 4) Reproduciendo binlogs hasta '$UNTIL_DATETIME'"
  BINLOG_PATHS=$(echo "$BINLOGS" | sed 's#^#/var/lib/mysql/#' | tr '\n' ' ')
  docker compose -f "$COMPOSE_FILE" exec -T mysql-backup sh -c \
    "mysqlbinlog --start-position=$START_POS --stop-datetime='$UNTIL_DATETIME' $BINLOG_PATHS" \
    | docker compose -f "$COMPOSE_FILE" exec -T mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${DB_NAME}"
fi

echo "==> Restore completo."
