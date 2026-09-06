#!/bin/bash
# Called by the existing local update worker, only for a published LePast SHA.
set -euo pipefail
ROOT=/Users/mac/FluxerCustom
SHA=${1:?source commit required}
VERSION=${2:?version required}
[[ "$SHA" =~ ^[a-f0-9]{40}$ && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
cd "$ROOT"
mkdir -p custom/state
LOCK="$ROOT/custom/state/mac-update.lock"
mkdir "$LOCK" 2>/dev/null || { echo 'Mac build already running'; exit 75; }
trap 'rmdir "$LOCK"' EXIT
[ -d .git ] || { echo 'Mac source checkout needs initialisation'; exit 2; }
git diff --quiet && git diff --cached --quiet || { echo 'Mac source has local changes; preserved'; exit 2; }
[ "$(git remote get-url origin)" = https://github.com/ThePastPlayer/FluxerCustom.git ] || exit 2
git fetch --no-tags origin "$SHA"
[ "$(git rev-parse FETCH_HEAD)" = "$SHA" ] || exit 2
git merge-base --is-ancestor HEAD "$SHA" || { echo 'Non-fast-forward source requires review'; exit 2; }
git -c advice.detachedHead=false checkout --detach "$SHA"
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
[ "$(node -p "require('./custom/config.json').version")" = "$VERSION" ] || exit 2
# Archive generated from that exact Windows release by our local build worker.
tar -xzf "custom/state/embedded-$VERSION.tar.gz" -C fluxer_desktop
node -e 'const fs=require("fs");fs.writeFileSync("custom/source-commit.txt",process.argv[1]+"\n")' "$SHA"
bash custom/mac-bootstrap.sh
bash custom/mac-build.sh
