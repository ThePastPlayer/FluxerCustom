param([switch]$SkipWeb, [switch]$SkipNative, [string]$SourceRoot)
$ErrorActionPreference = 'Stop'
$projectRoot = if($SourceRoot){[IO.Path]::GetFullPath($SourceRoot)}else{Split-Path $PSScriptRoot -Parent}
Set-Location $projectRoot
$config = Get-Content custom/config.json -Raw | ConvertFrom-Json
if($config.packageId -ne 'FluxerLePast'){ throw 'Wrong workspace' }
function Invoke-Step([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if($LASTEXITCODE -ne 0){ throw "$Program failed: $LASTEXITCODE" }
}
$rustRoot = Join-Path $env:USERPROFILE '.cargo/bin'
$llvmRoot = Join-Path $PSScriptRoot '.tools/llvm/bin'
if(-not (Test-Path (Join-Path $llvmRoot 'clang.exe'))){throw 'Install verified LLVM 23.1.0 first; see custom/README.md'}
$env:PATH="$llvmRoot;$rustRoot;$env:PATH"
$env:CC_wasm32_unknown_unknown=Join-Path $llvmRoot 'clang.exe'
$env:AR_wasm32_unknown_unknown=Join-Path $llvmRoot 'llvm-ar.exe'
$env:BUILD_CHANNEL='canary'
$env:ELECTRON_ARCH='x64'
$env:VERSION=$config.version
$env:PUBLIC_BUILD_VERSION=$config.version
$env:FLUXER_DESKTOP_PRODUCTION='true'
$env:FLUXER_SKIP_NATIVE=if($SkipNative){'true'}else{'false'}
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
$env:NODE_OPTIONS='--max-old-space-size=8192'
$env:RAYON_NUM_THREADS='4'
Invoke-Step 'node' @('custom/normalize-sources.mjs')
Invoke-Step 'npm' @('ci','--prefix','custom/test-tools','--ignore-scripts','--no-audit','--no-fund')
$env:PATH=(Join-Path $projectRoot 'custom/test-tools/node_modules/.bin')+';'+$env:PATH
$env:pnpm_config_pm_on_fail='ignore'
Invoke-Step 'pnpm' @('install','--frozen-lockfile')
if(-not (Test-Path fluxer_desktop/node_modules/electron/dist/electron.exe)){
    Invoke-Step 'node' @('fluxer_desktop/node_modules/electron/install.js')
}
# Shared compiler cache, never shipped.
$env:CARGO_TARGET_DIR=Join-Path $env:LOCALAPPDATA 'Temp/FluxerCustom-cargo'
Invoke-Step 'cargo' @('build','--manifest-path','tools/ci/Cargo.toml')
$ci=Join-Path $env:CARGO_TARGET_DIR 'debug/fluxer-ci.exe'
if(-not $SkipWeb){
    Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    Invoke-Step $ci @('build-app-wasm')
    Push-Location fluxer_app
    try {
        foreach($step in @('generate:colors','generate:message-layout','generate:theme-variables','generate:masks','generate:css-types','lingui:compile')){
            Invoke-Step 'pnpm' @('run',$step)
        }
        Invoke-Step 'pnpm' @('exec','rspack','build','--mode','production')
    } finally { Pop-Location }
}
Invoke-Step 'node' @('custom/embed-client.mjs')
$env:CARGO_TARGET_DIR=Join-Path $env:LOCALAPPDATA 'Temp/FluxerCustom-cargo'
Push-Location fluxer_desktop
try {
    Invoke-Step 'node' @('scripts/build.mjs')
    Invoke-Step 'pnpm' @('exec','tsgo','--noEmit')
    Invoke-Step 'node' @('--test','src/main/NativeScreenCapture.test.mjs','src/main/NativeScreenCaptureValidation.test.mjs','src/main/NativeHardwareEncoder.test.mjs')
    Invoke-Step 'pnpm' @('exec','electron-builder','--config','electron-builder.config.cjs','--win','--x64','--dir')
} finally { Pop-Location }
Invoke-Step 'node' @('--test','custom/test-client.mjs')
Invoke-Step 'node' @('custom/smoke-electron.mjs','--packaged')
$vpk = Join-Path $projectRoot 'custom/.tools/velopack/vpk.exe'
if(-not (Test-Path $vpk)){Invoke-Step 'dotnet' @('tool','install','vpk','--version','0.0.1298','--tool-path',(Split-Path $vpk))}
Invoke-Step $vpk @('pack','--packId','FluxerLePast','--packVersion',$config.version,'--packDir','fluxer_desktop/dist-electron/win-unpacked','--mainExe','Fluxer LePast.exe','--packTitle','Fluxer LePast','--packAuthors','LePast; Fluxer contributors','--runtime','win-x64','--channel','win','--outputDir',("custom/releases/"+$config.version),'--delta','None','--icon','fluxer_desktop/build_resources/icons-canary/icon.ico')
Invoke-Step 'node' @('custom/release-receipt.mjs')
