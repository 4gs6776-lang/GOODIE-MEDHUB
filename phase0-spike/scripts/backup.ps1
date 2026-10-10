# Windows backup. Needs PostgreSQL bin folder on PATH. Schedule with Task Scheduler.
param([string]$Dest = ".\backups")
if (-not $env:DATABASE_URL) { throw "Set DATABASE_URL first" }
New-Item -ItemType Directory -Force $Dest | Out-Null
$f = Join-Path $Dest ("medhub-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dump")
pg_dump --format=custom --file=$f $env:DATABASE_URL
pg_restore --list $f | Out-Null
if ($LASTEXITCODE -eq 0) { "Backup OK and readable: $f" } else { throw "Backup unreadable!" }
