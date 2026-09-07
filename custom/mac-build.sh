#!/bin/bash
# Native Apple Silicon build. The already-verified embedded frontend is shared
# with the Windows release; native code is compiled here, never cross-emulated.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
export CARGO_HOME="$ROOT/custom/.tools/cargo" RUSTUP_HOME="$ROOT/custom/.tools/rustup"
export PATH="$ROOT/custom/test-tools/node_modules/.bin:$CARGO_HOME/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export pnpm_config_pm_on_fail=ignore
export BUILD_CHANNEL=canary ELECTRON_ARCH=arm64 FLUXER_DESKTOP_PRODUCTION=true
export VERSION=$(node -p "require('./custom/config.json').version")
export PUBLIC_BUILD_VERSION="$VERSION"
export CARGO_TARGET_DIR="$ROOT/custom/.tools/cargo-target"
export CARGO_BUILD_JOBS=4 RAYON_NUM_THREADS=4
export MACOSX_DEPLOYMENT_TARGET=13.0
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('fluxer_desktop/embedded-client/manifest-integrity.json'));if(m.version!==process.env.VERSION)throw Error('Embedded version mismatch');"
cd fluxer_desktop
if [ "${LEPAST_SKIP_COMPILE:-0}" != 1 ]; then node scripts/build.mjs; fi
pnpm exec tsgo --noEmit
node --test src/main/NativeScreenCapture.test.mjs src/main/NativeScreenCaptureValidation.test.mjs src/main/NativeHardwareEncoder.test.mjs
cd "$ROOT"
node --test custom/test-client.mjs custom/test-regressions.mjs custom/test-stream-volume.mjs

# Reuse the existing Wantap signing material in place. Never echo secrets,
# export them to the repo, or alter the user's persistent keychain list.
set +x
source /Users/mac/mpds-signing/signing.env
for variable in P12 P12PW P8 KEYID ISSUER; do
  [ -n "${!variable:-}" ] || { echo "Missing signing configuration: $variable"; exit 1; }
done
SIGN_DIR=$(mktemp -d "$ROOT/custom/.tools/fluxer-sign.XXXXXX")
KC="$SIGN_DIR/build.keychain-db"
KCPW=$(openssl rand -hex 24)
cleanup() { security delete-keychain "$KC" >/dev/null 2>&1 || true; }
trap cleanup EXIT
security create-keychain -p "$KCPW" "$KC"
security set-keychain-settings -lut 21600 "$KC"
security unlock-keychain -p "$KCPW" "$KC"
security import "$P12" -k "$KC" -P "$P12PW" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KCPW" "$KC" >/dev/null
# codesign also needs the temporary identity in the user's search list, even
# with --keychain. delete-keychain in the EXIT trap removes only this entry.
KEYCHAINS=()
while IFS= read -r keychain; do
  KEYCHAINS+=("$keychain")
done < <(security list-keychains -d user | sed 's/^[[:space:]]*"//; s/"[[:space:]]*$//')
security list-keychains -d user -s "$KC" "${KEYCHAINS[@]}"
export CSC_KEYCHAIN="$KC"
export CSC_NAME=$(security find-identity -v -p codesigning "$KC" | awk '/Developer ID Application:/ {print $2; exit}')
[ -n "$CSC_NAME" ] || { echo 'Developer ID Application identity missing'; exit 1; }
export CSC_IDENTITY_AUTO_DISCOVERY=true
cd "$ROOT/fluxer_desktop"
pnpm exec electron-builder --config electron-builder.config.cjs --mac --arm64 --dir --publish never
APP="$ROOT/fluxer_desktop/dist-electron/mac-arm64/Fluxer LePast.app"
codesign --verify --deep --strict "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E '^(Identifier|Authority|TeamIdentifier)='
cd "$ROOT"
node custom/smoke-electron.mjs --packaged
OUT="$ROOT/custom/releases/darwin-arm64/$VERSION"
mkdir -p "$OUT"
ZIP="$OUT/Fluxer-LePast-$VERSION-darwin-arm64.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --key "$P8" --key-id "$KEYID" --issuer "$ISSUER" --wait --timeout 30m --output-format json > "$OUT/notarization-app.json"
node -e "if(require(process.argv[1]).status!=='Accepted')throw Error('App notarization failed')" "$OUT/notarization-app.json"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=2 "$APP"
# Zip the stapled app for Squirrel.Mac updates (same signed code, added ticket).
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
DMGROOT=$(mktemp -d "$ROOT/custom/.tools/fluxer-dmg.XXXXXX")
cp -cRp "$APP" "$DMGROOT/Fluxer LePast.app"
ln -s /Applications "$DMGROOT/Applications"
DMG="$OUT/Fluxer-LePast-$VERSION-darwin-arm64.dmg"
hdiutil create -volname 'Fluxer LePast' -srcfolder "$DMGROOT" -ov -format UDZO "$DMG"
xcrun notarytool submit "$DMG" --key "$P8" --key-id "$KEYID" --issuer "$ISSUER" --wait --timeout 30m --output-format json > "$OUT/notarization-dmg.json"
node -e "if(require(process.argv[1]).status!=='Accepted')throw Error('DMG notarization failed')" "$OUT/notarization-dmg.json"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
node custom/mac-receipt.mjs
# Discard only this project's reproducible dev compiler cache. Signed releases
# and the native release cache are retained; the Mac also hosts other projects.
cargo clean --manifest-path "$ROOT/tools/ci/Cargo.toml" --target-dir "$CARGO_TARGET_DIR" --profile dev
echo "Signed, notarized and verified macOS release: $VERSION"
