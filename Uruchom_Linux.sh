#!/bin/bash
cd "$(dirname "$0")"

PORT=8765

if command -v node >/dev/null 2>&1; then
    node server.js &
elif command -v python3 >/dev/null 2>&1; then
    python3 -m http.server $PORT &
elif command -v python >/dev/null 2>&1; then
    python -m SimpleHTTPServer $PORT &
else
    xdg-open "index.html" 2>/dev/null || sensible-browser "index.html" 2>/dev/null
    exit 0
fi

sleep 0.8
xdg-open "http://127.0.0.1:$PORT" 2>/dev/null || sensible-browser "http://127.0.0.1:$PORT" 2>/dev/null
