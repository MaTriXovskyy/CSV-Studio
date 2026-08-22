#!/bin/bash
cd "$(dirname "$0")"

PORT=8765

# Sprawdź czy dostępny jest Node.js lub Python do uruchomienia serwera lokalnego
if command -v node >/dev/null 2>&1; then
    node server.js &
elif command -v python3 >/dev/null 2>&1; then
    python3 -m http.server $PORT &
elif command -v python >/dev/null 2>&1; then
    python -m SimpleHTTPServer $PORT &
else
    open "index.html"
    exit 0
fi

sleep 0.8
open "http://127.0.0.1:$PORT"
