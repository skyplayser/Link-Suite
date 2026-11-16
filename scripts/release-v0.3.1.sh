#!/bin/sh
# Veraltet: ruft scripts/release.sh auf (Version aus package.json). Bleibt nur, weil das README diesen Namen nennt.
exec sh "$(dirname "$0")/release.sh" "$@"
