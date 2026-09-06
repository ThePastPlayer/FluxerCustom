$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$pwsh=(Get-Process -Id $PID).Path
if($PSVersionTable.PSVersion.Major -lt 7){throw 'Run this installer with PowerShell 7'}
$name='Fluxer LePast - Build updates'
if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'Task already exists; review it before replacing'}
$action=New-ScheduledTaskAction -Execute $pwsh -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $root 'custom/worker.ps1')+'"') -WorkingDirectory $root
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$triggers=@(
    (New-ScheduledTaskTrigger -AtLogOn -User $identity),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 30))
)
$principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'Compile/test queued upstream Fluxer updates locally; publish only approved successful candidates.' | Select-Object TaskName,State
