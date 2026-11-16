#!/bin/sh
# Link-Suite (Version aus package.json): nur prüfen und Hinweise ausgeben. Veröffentlicht wird ausschließlich über den Tag-Workflow
# (.github/workflows/release.yml), der die Pakete selbst baut und SHA256SUMS erzeugt. Dieses Skript führt nichts bei
# GitHub aus; die Prüfsummen hier gelten nur für die lokal gebauten Dateien (zum Testen).
set -eu
cd "$(dirname "$0")/.."
TAG="v$(node -p "require('./package.json').version")"
NOTES="docs/releases/$TAG.md"
[ -f "$NOTES" ] || { echo "fehlt: $NOTES" >&2; exit 1; }
echo "Release-Text: $NOTES"
if ls release/Link-Suite-macos-*.dmg release/Link-Suite-windows.exe >/dev/null 2>&1; then
  echo "Lokale Prüfsummen (nur zum Testen, nicht veröffentlichen):"
  (cd release && shasum -a 256 Link-Suite-macos-*.dmg Link-Suite-windows.exe 2>/dev/null || true)
fi
echo
echo "Veröffentlichen (erst nach eigenem Test, nicht von diesem Skript ausgeführt):"
echo "  git tag $TAG && git push origin $TAG   # startet .github/workflows/release.yml"
