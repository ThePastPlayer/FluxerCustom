#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
src="$(cd -- "$(dirname -- "$0")" && pwd)"
base=/opt/fluxer-custom
backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 755 "$base/bin" "$base/public/releases" "$base/public/updates" "$backup"
install -d -m 750 -o ubuntu -g ubuntu "$base/state" "$base/incoming"
for name in downloads.py check-upstream.py publish.py; do
  if test -f "$base/bin/$name"; then cp -p "$base/bin/$name" "$backup/$name"; fi
  install -m 755 "$src/$name" "$base/bin/$name"
done
for name in fluxer-custom-downloads.service fluxer-custom-check.service fluxer-custom-check.timer; do
  if test -f "/etc/systemd/system/$name"; then cp -p "/etc/systemd/system/$name" "$backup/$name"; fi
  install -m 644 "$src/$name" "/etc/systemd/system/$name"
done
route=/opt/server-management/traefik-maquette/dynamic/fluxer-custom.yml
if test -f "$route"; then cp -p "$route" "$backup/traefik.yml"; fi
install -m 644 "$src/index.html" "$base/public/index.html"
test -L "$base/public/updates/win32-x64" || ln -s ../current/feed "$base/public/updates/win32-x64"
test -L "$base/public/release.json" || ln -s current/release.json "$base/public/release.json"
if ! test -f "$base/state/current.json"; then
  install -m 640 -o ubuntu -g ubuntu "$src/initial-state.json" "$base/state/current.json"
fi
systemctl daemon-reload
systemctl enable --now fluxer-custom-downloads.service fluxer-custom-check.timer
curl --fail --silent --retry 5 --retry-connrefused --retry-delay 1 http://127.0.0.1:8179/fluxer-custom/ >/dev/null
install -m 644 "$src/traefik.yml" "$route"
printf 'Dedicated download service ready. Backup: %s\n' "$backup"
