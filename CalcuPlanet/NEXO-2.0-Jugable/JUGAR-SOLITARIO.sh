#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v open >/dev/null 2>&1; then open NEXO-JUGAR.html; else xdg-open NEXO-JUGAR.html; fi
