param([int]$Port = 3000)

$ErrorActionPreference = 'SilentlyContinue'

$conns = Get-NetTCPConnection -LocalPort $Port
if (-not $conns) {
  Write-Output "No processes found on port $Port."
  exit 0
}

$pids = $conns | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
Write-Output ("Found PIDs: " + ($pids -join ', '))

foreach ($pid in $pids) {
  try {
    $proc = Get-Process -Id $pid -ErrorAction Stop
    Write-Output ("Stopping PID {0} ({1})" -f $pid, $proc.ProcessName)
    Stop-Process -Id $pid -Force -ErrorAction Stop
    Write-Output ("Stopped PID {0}" -f $pid)
  } catch {
    Write-Output ("Failed to stop PID {0}: {1}" -f $pid, $_.Exception.Message)
  }
}

