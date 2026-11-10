$ErrorActionPreference = 'Stop'
$dockerPath = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
& $dockerPath info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Abra o Docker Desktop e aguarde ele iniciar antes de executar este arquivo.' }
& $dockerPath compose --env-file (Join-Path $PSScriptRoot '.env.local') -f (Join-Path $PSScriptRoot 'compose.local.yaml') up -d
if ($LASTEXITCODE -ne 0) { throw 'Os servicos do bot nao puderam iniciar.' }
Write-Host 'WAHA: http://localhost:3001/dashboard'
Write-Host 'n8n: http://localhost:5678'