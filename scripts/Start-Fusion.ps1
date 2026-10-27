[CmdletBinding()]
param(
  [ValidateSet('dev', 'build', 'start', 'verify', 'status')]
  [string]$Task = 'dev',
  [AllowEmptyString()]
  [string]$BasePath = '/fusion',
  [ValidateSet('node', 'worker')]
  [string]$Runtime = 'node',
  [ValidateRange(1, 65535)]
  [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if ($BasePath -ne '' -and $BasePath -notmatch '^/[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*$') {
  throw 'BasePath must be empty or a path such as /fusion.'
}

# Choose a compatible runtime for this process; do not change global Node/pnpm.
$runtimeCandidates = @(
  $env:FUSION_NODE,
  (Join-Path $env:APPDATA 'nvm/v22.13.0/node.exe'),
  (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
)
$onPath = Get-Command node -ErrorAction SilentlyContinue
if ($onPath) { $runtimeCandidates += $onPath.Source }
$nodeBinary = $null
foreach ($candidate in $runtimeCandidates) {
  if (-not $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
  $versionText = & $candidate --version
  if ($LASTEXITCODE -eq 0 -and [version]($versionText.TrimStart('v')) -ge [version]'22.13.0') {
    $nodeBinary = $candidate
    break
  }
}
if (-not $nodeBinary) { throw 'Node 22.13 or later is required. Set FUSION_NODE to its executable.' }

function Invoke-FusionNode {
  param([string[]]$NodeArguments)
  & $nodeBinary @NodeArguments
  if ($LASTEXITCODE -ne 0) { throw "Fusion task failed with exit code $LASTEXITCODE." }
}

$previousBase = $env:NEXT_PUBLIC_BASE_PATH
$previousRuntime = $env:FUSION_RUNTIME
Push-Location $projectRoot
try {
  $env:NEXT_PUBLIC_BASE_PATH = $BasePath
  $env:FUSION_RUNTIME = $Runtime
  Write-Host "Website: $projectRoot"
  Write-Host "Android: D:\MealPlannerAU"
  Write-Host "Public site: https://gearsqueens.online/fusion/"
  Write-Host "Node: $nodeBinary"
  Write-Host "Runtime profile: $Runtime"
  Write-Host "Preview path: /$($BasePath.Trim('/'))"
  switch ($Task) {
    'status' { Invoke-FusionNode -NodeArguments @('--version') }
    'dev' { Invoke-FusionNode -NodeArguments @('scripts/run-framework.mjs', 'dev', '--port', "$Port") }
    'start' { Invoke-FusionNode -NodeArguments @('scripts/run-framework.mjs', 'start', '--port', "$Port") }
    'build' {
      Invoke-FusionNode -NodeArguments @('scripts/run-framework.mjs', 'build')
      Invoke-FusionNode -NodeArguments @('scripts/mirror-public.mjs')
      if ($Runtime -eq 'worker') { Invoke-FusionNode -NodeArguments @('scripts/local-image-env.mjs') }
    }
    'verify' {
      Invoke-FusionNode -NodeArguments @('scripts/test.mjs')
      Invoke-FusionNode -NodeArguments @('node_modules/typescript/bin/tsc', '--noEmit', '--allowImportingTsExtensions')
      Invoke-FusionNode -NodeArguments @('node_modules/eslint/bin/eslint.js', '.', '--ignore-pattern', 'dist', '--ignore-pattern', '.next')
    }
  }
} finally {
  $env:NEXT_PUBLIC_BASE_PATH = $previousBase
  $env:FUSION_RUNTIME = $previousRuntime
  Pop-Location
}

