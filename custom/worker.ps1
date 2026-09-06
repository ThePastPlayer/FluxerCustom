param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$env:GIT_TERMINAL_PROMPT='0'
$env:GCM_INTERACTIVE='never'
$projectRoot=Split-Path $PSScriptRoot -Parent
$stateDir=Join-Path $projectRoot 'custom/state'
$result=$null
$attemptFile=$null
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$mutex=[Threading.Mutex]::new($false,'Local\FluxerLePastWeeklyBuilder')
if(-not $mutex.WaitOne(0)){exit 0}
$log=Join-Path $stateDir 'worker.log'
function Run([string]$program,[string[]]$arguments){
    & $program @arguments
    if($LASTEXITCODE -ne 0){throw "$program failed ($LASTEXITCODE)"}
}
try {
    $candidateText=& ssh -o BatchMode=yes -o ConnectTimeout=15 vps-ff2aa08a 'cat /opt/fluxer-custom/state/candidate.json'
    if($LASTEXITCODE -ne 0){throw 'VPS queue unavailable'}
    $candidate=$candidateText | ConvertFrom-Json
    if(-not $candidate.pending){Write-Output 'No upstream update queued';exit 0}
    if($candidate.commit -notmatch '^[0-9a-f]{40}$' -or $candidate.tag -notmatch '^fluxer-desktop-canary@\d{4}\.\d+\.\d+$'){throw 'Invalid upstream candidate'}
    $attemptFile=Join-Path $stateDir ($candidate.commit+'.json')
    if(Test-Path $attemptFile){Write-Output 'Candidate already processed; waiting for a newer version';exit 0}
    if($CheckOnly){Write-Output ("Would process "+$candidate.tag);exit 0}
    $buildParent=Join-Path $env:LOCALAPPDATA 'Temp/FluxerLePast-builds'
    New-Item -ItemType Directory -Force -Path $buildParent | Out-Null
    $buildRoot=Join-Path $buildParent $candidate.commit
    if(Test-Path $buildRoot){throw 'Existing candidate workspace; review before retry'}
    if((Get-PSDrive C).Free -lt 15GB){throw 'Build paused: less than 15 GiB free'}
    $result=@{candidate=$candidate.commit;tag=$candidate.tag;startedAt=(Get-Date).ToUniversalTime().ToString('o');status='building'}
    $result | ConvertTo-Json | Set-Content -Encoding utf8 $attemptFile
    Start-Transcript -Path $log -Append | Out-Null
    Run 'git' @('-c','core.autocrlf=false','clone','--branch','lepast/custom','--single-branch','https://github.com/ThePastPlayer/FluxerCustom.git',$buildRoot)
    Set-Location $buildRoot
    Run 'git' @('config','user.name','Fluxer LePast Builder')
    Run 'git' @('config','user.email','fluxer-builder@lepast.fr')
    Run 'git' @('config','core.autocrlf','false')
    Run 'git' @('remote','add','upstream','https://github.com/fluxerapp/fluxer.git')
    Run 'git' @('fetch','upstream',('refs/tags/'+$candidate.tag))
    $resolved=(& git rev-parse 'FETCH_HEAD^{commit}').Trim()
    if($LASTEXITCODE -ne 0 -or $resolved -ne $candidate.commit){throw 'Upstream ref changed after discovery'}
    $config=Get-Content custom/config.json -Raw | ConvertFrom-Json
    $changed=& git diff --name-only $config.upstreamCommit $candidate.commit
    if($LASTEXITCODE -ne 0){throw 'Cannot compare official sources'}
    $critical=$changed | Where-Object {$_ -match '^(fluxer_desktop/src/(preload/|common/(DesktopConfig|Constants|DesktopIdentity|UserDataPath)|main/(index|Window|Ipc|Updater|Embedded|Permission|Security))|fluxer_desktop/(package\.json|scripts/|electron-builder)|pnpm-lock\.yaml|pnpm-workspace\.yaml|package\.json|tools/ci/)'}
    if($critical){
        $result.status='review_required';$result.files=@($critical)
        throw 'Security/build/dependency changes require review; no automatic publication'
    }
    Run 'git' @('merge','--no-commit','--no-ff',$candidate.commit)
    $parts=$config.version.Split('.')
    $config.version="$($parts[0]).$($parts[1]).$([int]$parts[2]+1)"
    $config.upstreamTag=$candidate.tag
    $config.upstreamCommit=$candidate.commit
    $config | ConvertTo-Json | Set-Content -Encoding utf8 custom/config.json
    Run 'git' @('add','custom/config.json')
    Run 'git' @('commit','-m',("Integrate "+$candidate.tag+" as LePast "+$config.version))
    & (Join-Path $projectRoot 'custom/build.ps1') -SourceRoot $buildRoot
    if(-not $?){throw 'Build gate failed'}
    Run 'git' @('push','origin','HEAD:refs/heads/lepast/custom')
    & (Join-Path $projectRoot 'custom/publish.ps1') -ProjectRoot $buildRoot
    $result.status='published';$result.version=$config.version
} catch {
    if($result){
        if($result.status -eq 'building'){$result.status='failed'}
        $result.error=$_.Exception.Message
    }
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if($result -and $attemptFile){$result | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $attemptFile}
    # Independent Mac queue: also runs when no NEW upstream tag is queued.
    # An offline Mac never changes or blocks the already-published Windows feed.
    try { & (Join-Path $projectRoot 'custom/mac-sync.ps1') -CheckOnly:$CheckOnly }
    catch { Write-Warning ("Mac phase deferred: "+$_.Exception.Message) }
    try {Stop-Transcript | Out-Null}catch{}
    $mutex.ReleaseMutex();$mutex.Dispose()
}
