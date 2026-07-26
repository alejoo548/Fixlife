#!/bin/bash
set -euo pipefail

cd /data

PBF_FILE="el-salvador-latest.osm.pbf"
OSRM_FILE="el-salvador-latest.osrm"

if [ ! -f "$PBF_FILE" ]; then
  echo "[osrm] Missing $PBF_FILE in /data. Download it on the host into docker/osrm/data before starting this service." >&2
  exit 1
fi

if [ ! -f "$OSRM_FILE" ]; then
  echo "[osrm] No preprocessed graph found, building it from $PBF_FILE (one-time, a few minutes)..."
  osrm-extract -p /opt/car.lua "$PBF_FILE"
  osrm-partition "$OSRM_FILE"
  osrm-customize "$OSRM_FILE"
  echo "[osrm] Graph build complete."
else
  echo "[osrm] Using existing preprocessed graph."
fi

echo "[osrm] Starting osrm-routed..."
exec osrm-routed --algorithm mld "$OSRM_FILE"
