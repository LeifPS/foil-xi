#!/usr/bin/env bash
# Führt alle Regressionstests in diesem Ordner nacheinander aus. Startet bei Bedarf selbst kurz einen
# lokalen Static-Server für index.html (Port 8931, überschreibbar per FOIL_TEST_PORT), falls dort noch
# keiner läuft, und beendet ihn am Ende wieder (nur wenn dieses Skript ihn selbst gestartet hat).
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${FOIL_TEST_PORT:-8931}"
STARTED_SERVER=0

if ! curl -s -o /dev/null "http://localhost:${PORT}/index.html"; then
  echo "Starte lokalen Test-Server auf Port ${PORT} ..."
  python3 -m http.server "${PORT}" > /tmp/foil_test_server.log 2>&1 &
  SERVER_PID=$!
  STARTED_SERVER=1
  for i in $(seq 1 20); do
    curl -s -o /dev/null "http://localhost:${PORT}/index.html" && break
    sleep 0.5
  done
fi

export FOIL_TEST_URL="http://localhost:${PORT}/index.html?nosave=1"

FAIL=0
for f in tests/*.test.js; do
  echo ""
  echo "=== $f ==="
  node "$f" || FAIL=1
done

if [ "$STARTED_SERVER" = "1" ]; then
  kill "$SERVER_PID" 2>/dev/null
fi

echo ""
if [ "$FAIL" = "0" ]; then
  echo "Alle Regressionstests bestanden."
else
  echo "MINDESTENS EIN TEST IST FEHLGESCHLAGEN."
fi
exit $FAIL
