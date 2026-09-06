param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$stateDir=Join-Path $projectRoot 'custom/state'
$key=Join-Path $env:USERPROFILE '.ssh/mpds_mac'
$mac='mac@192.168.0.161'
$sshArgs=@('-i',$key,'-o','BatchMode=yes','-o','ConnectTimeout=15')
$mutex=[Threading.Mutex]::new($false,'Local\FluxerLePastMacBuilder')
if(-not $mutex.WaitOne(0)){return}
function MacRun([string]$program,[string[]]$arguments){
    & $program @arguments
    if($LASTEXITCODE -ne 0){throw "$program failed ($LASTEXITCODE)"}
}
try {
    $win=Invoke-RestMethod 'https://chat.lepast.fr/fluxer-custom/release.json'
    try {$current=Invoke-RestMethod 'https://chat.lepast.fr/fluxer-custom/current-darwin-arm64/release.json'}
    catch {if($_.Exception.Response.StatusCode.value__ -ne 404){throw};$current=$null}
    if($current -and [version]$current.version -ge [version]$win.version){Write-Output 'macOS is up to date';return}
    if($win.version -notmatch '^\d+\.\d+\.\d+$' -or $win.sourceCommit -notmatch '^[a-f0-9]{40}$' -or $win.upstreamCommit -notmatch '^[a-f0-9]{40}$' -or $win.testsPassed -ne $true){throw 'Invalid Windows source receipt'}
    $version=$win.version
    $attempt=Join-Path $stateDir "mac-$version.json"
    if(Test-Path $attempt){Write-Output 'Mac candidate already attempted; waiting for a newer release';return}
    $sourceRoot=$null
    $roots=@($projectRoot,(Join-Path $env:LOCALAPPDATA "Temp/FluxerLePast-builds/$($win.upstreamCommit)"))
    foreach($root in $roots){
        if(-not(Test-Path (Join-Path $root '.git'))){continue}
        $sha=(& git -C $root rev-parse HEAD).Trim()
        if($LASTEXITCODE -eq 0 -and $sha -eq $win.sourceCommit){$sourceRoot=$root;break}
    }
    if(-not $sourceRoot){Write-Output 'Mac build queued: exact Windows source/bundle not available locally';return}
    $embedded=Join-Path $sourceRoot 'fluxer_desktop/embedded-client/manifest-integrity.json'
    if(-not(Test-Path $embedded) -or (Get-Content $embedded -Raw|ConvertFrom-Json).version -ne $version){throw 'Embedded bundle version mismatch'}
    if($CheckOnly){Write-Output "Would build macOS $version from $($win.sourceCommit)";return}
    # Offline Mac is a deferral, not a failed candidate. No credential prompts.
    & ssh @sshArgs $mac 'test -d /Users/mac/FluxerCustom/.git'
    if($LASTEXITCODE -ne 0){Write-Output 'Mac unavailable or checkout not ready; retry next worker run';return}
    $free=& ssh @sshArgs $mac 'df -k /System/Volumes/Data | tail -1 | awk ''{print $4}'''
    if($LASTEXITCODE -ne 0 -or [long]$free -lt 4MB){Write-Output 'Mac build deferred: less than 4 GiB free';return}
    $archive=Join-Path $stateDir "embedded-$version.tar.gz"
    MacRun 'tar' @('-czf',$archive,'-C',(Join-Path $sourceRoot 'fluxer_desktop'),'embedded-client')
    MacRun 'scp' @('-q','-i',$key,$archive,($mac+":/Users/mac/FluxerCustom/custom/state/embedded-$version.tar.gz"))
    $result=@{version=$version;sourceCommit=$win.sourceCommit;status='building';startedAt=(Get-Date).ToUniversalTime().ToString('o')}
    $result|ConvertTo-Json|Set-Content -Encoding utf8 $attempt
    MacRun 'ssh' ($sshArgs+@($mac,"bash /Users/mac/FluxerCustom/custom/mac-update-build.sh $($win.sourceCommit) $version > /Users/mac/FluxerCustom/custom/state/build-$version.log 2>&1"))
    $out=Join-Path $projectRoot "custom/releases/darwin-arm64/$version"
    New-Item -ItemType Directory -Force $out|Out-Null
    $names=@("Fluxer-LePast-$version-darwin-arm64.zip","Fluxer-LePast-$version-darwin-arm64.dmg",'RELEASES.json','release.json')
    foreach($name in $names){MacRun 'scp' @('-q','-i',$key,($mac+":/Users/mac/FluxerCustom/custom/releases/darwin-arm64/$version/$name"),(Join-Path $out $name))}
    $receipt=Get-Content (Join-Path $out 'release.json') -Raw|ConvertFrom-Json
    if($receipt.sourceCommit -ne $win.sourceCommit -or $receipt.platform -ne 'darwin-arm64' -or -not $receipt.signed -or -not $receipt.notarized -or -not $receipt.testsPassed){throw 'Mac receipt gate failed'}
    foreach($name in $names | Where-Object {$_ -ne 'release.json'}){if((Get-FileHash (Join-Path $out $name) -Algorithm SHA256).Hash.ToLower() -ne $receipt.sha256.$name){throw "Mac hash mismatch: $name"}}
    MacRun 'ssh' @('-o','BatchMode=yes','vps-ff2aa08a',"mkdir -p /opt/fluxer-custom/incoming/darwin-arm64/$version")
    foreach($name in $names){MacRun 'scp' @('-q',(Join-Path $out $name),"vps-ff2aa08a:/opt/fluxer-custom/incoming/darwin-arm64/$version/$name")}
    MacRun 'ssh' @('-o','BatchMode=yes','vps-ff2aa08a',"sudo -n python3 /opt/fluxer-custom/bin/publish-mac.py $version")
    $published=Invoke-RestMethod 'https://chat.lepast.fr/fluxer-custom/current-darwin-arm64/release.json'
    if($published.version -ne $version -or $published.sourceCommit -ne $win.sourceCommit){throw 'Public Mac receipt mismatch'}
    $result.status='published'
    Write-Output "macOS $version published independently from Windows"
} catch {
    if($result){$result.status='failed';$result.error=$_.Exception.Message}
    Write-Warning "macOS update held: $($_.Exception.Message)"
} finally {
    if($result -and $attempt){$result|ConvertTo-Json|Set-Content -Encoding utf8 $attempt}
    $mutex.ReleaseMutex();$mutex.Dispose()
}
