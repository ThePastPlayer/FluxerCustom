#!/bin/bash
# Local tools only. No global Node/Rust changes, no other project's build files.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export CARGO_HOME="$ROOT/custom/.tools/cargo"
export RUSTUP_HOME="$ROOT/custom/.tools/rustup"
mkdir -p "$ROOT/custom/.tools"
if [ ! -x "$CARGO_HOME/bin/cargo" ]; then
  cd "$ROOT/custom/.tools"
  curl --fail --location --proto '=https' --tlsv1.2 https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init -o rustup-init
  curl --fail --location --proto '=https' --tlsv1.2 https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init.sha256 -o rustup-init.sha256
  shasum -a 256 -c rustup-init.sha256
  chmod 700 rustup-init
  ./rustup-init -y --no-modify-path --profile minimal --default-toolchain 1.95.0
fi
export PATH="$CARGO_HOME/bin:$PATH"
cd "$ROOT"
npm ci --prefix custom/test-tools --ignore-scripts --no-audit --no-fund
export PATH="$ROOT/custom/test-tools/node_modules/.bin:$PATH"
export pnpm_config_pm_on_fail=ignore
pnpm --filter 'fluxer_desktop...' install --frozen-lockfile
if [ ! -d fluxer_desktop/node_modules/electron/dist/Electron.app ]; then
  node fluxer_desktop/node_modules/electron/install.js
fi
echo 'Mac build tools ready'
