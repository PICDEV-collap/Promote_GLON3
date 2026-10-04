$ErrorActionPreference = 'Stop'
$taskNode = (Get-Command node.exe).Source
& $taskNode (Join-Path $PSScriptRoot 'bot-supervisor.js')
exit $LASTEXITCODE
