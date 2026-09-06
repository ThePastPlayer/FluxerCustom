param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference='Stop'
Set-Location $ProjectRoot
$config=Get-Content custom/config.json -Raw | ConvertFrom-Json
if($config.packageId -ne 'FluxerLePast' -or $config.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid release'}
$version=$config.version
$receipt=Get-Content "custom/releases/$version/release.json" -Raw | ConvertFrom-Json
if(-not $receipt.testsPassed){throw 'Tests failed'}
$remote="vps-ff2aa08a"
& ssh -o BatchMode=yes -o ConnectTimeout=15 $remote "mkdir -p /opt/fluxer-custom/incoming/$version"
if($LASTEXITCODE -ne 0){throw 'Cannot prepare upload'}
$names=@("FluxerLePast-$version-full.nupkg",'FluxerLePast-win-Setup.exe','releases.win.json','RELEASES','release.json')
foreach($name in $names){
    $destination=$remote+":/opt/fluxer-custom/incoming/$version/$name"
    & scp -q (Join-Path $ProjectRoot "custom/releases/$version/$name") $destination
    if($LASTEXITCODE -ne 0){throw "Upload failed: $name"}
}
& ssh -o BatchMode=yes $remote "sudo -n python3 /opt/fluxer-custom/bin/publish.py $version"
if($LASTEXITCODE -ne 0){throw 'Publication refused; previous feed preserved'}
$public=Invoke-RestMethod "https://chat.lepast.fr/fluxer-custom/release.json"
if($public.version -ne $version -or $public.sourceCommit -ne $receipt.sourceCommit){throw 'Public receipt mismatch'}
Write-Output "Published and verified: $version"
