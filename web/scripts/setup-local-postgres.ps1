$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$testEnvPath = Join-Path $projectRoot ".env.test"
$psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$dbHost = "127.0.0.1"
$dbPort = 5432
$appRole = "nexus_app"
$adminPassword = $null
$appPassword = $null
$confirmPassword = $null
$secureAppPassword = $null
$secureAppPasswordConfirm = $null
$devUrl = $null
$testUrl = $null

if (-not (Test-Path -LiteralPath $psqlPath)) {
  throw "PostgreSQL 18 psql.exe was not found at the expected install path: $psqlPath"
}
foreach ($path in @($envPath, $testEnvPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Expected existing environment file was not found: $path"
  }
}

function ConvertTo-PlainText([Security.SecureString] $Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Get-Sha256([string] $Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = $algorithm.ComputeHash($bytes)
    return [BitConverter]::ToString($hash).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $algorithm.Dispose()
  }
}

function Set-DatabaseEnvironment([string] $Path, [string] $Environment, [string] $Url) {
  $lines = [Collections.Generic.List[string]]::new()
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -notmatch '^\s*(DATABASE_URL|DIRECT_URL|DATABASE_ENV|DATABASE_URL_SHA256)=') {
      $lines.Add($line)
    }
  }

  $lines.Add("DATABASE_URL=$Url")
  $lines.Add("DIRECT_URL=$Url")
  $lines.Add("DATABASE_ENV=$Environment")
  $lines.Add("DATABASE_URL_SHA256=$(Get-Sha256 $Url)")
  [IO.File]::WriteAllLines($Path, $lines, [Text.UTF8Encoding]::new($false))
}

$adminSecure = Read-Host "Enter the local PostgreSQL administrator password (hidden input)" -AsSecureString
$adminPassword = ConvertTo-PlainText $adminSecure
$env:PGPASSWORD = $adminPassword
$adminPassword = $null
$adminSecure.Dispose()

try {
  $existing = & $psqlPath -X -w -h $dbHost -p $dbPort -U postgres -d postgres -Atc `
    "SELECT (CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$appRole') THEN '1' ELSE '0' END) || ':' || (SELECT count(*)::text FROM pg_database WHERE datname IN ('nexus_dev', 'nexus_test'));"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not authenticate to the local PostgreSQL server. Confirm the administrator password and that PostgreSQL is running on port $dbPort."
  }
  if ($existing.Trim() -ne "0:0") {
    throw "Found an existing nexus_app role or target database. Nothing was changed; inspect them before retrying."
  }

  $secureAppPassword = Read-Host "Choose a strong password for the local nexus_app role (hidden input)" -AsSecureString
  $secureAppPasswordConfirm = Read-Host "Re-enter the local nexus_app password (hidden input)" -AsSecureString
  $appPassword = ConvertTo-PlainText $secureAppPassword
  $confirmPassword = ConvertTo-PlainText $secureAppPasswordConfirm
  $secureAppPassword.Dispose()
  $secureAppPasswordConfirm.Dispose()
  if ($appPassword.Length -lt 20) {
    throw "Use a password with at least 20 characters. No database objects were created."
  }
  if ($appPassword -cne $confirmPassword) {
    throw "The two application passwords did not match. No database objects were created."
  }
  $confirmPassword = $null

  $quotedPassword = $appPassword.Replace("'", "''")
  $sql = @"
\set ON_ERROR_STOP on
CREATE ROLE nexus_app LOGIN PASSWORD '$quotedPassword';
CREATE DATABASE nexus_dev OWNER nexus_app;
CREATE DATABASE nexus_test OWNER nexus_app;
"@
  $sqlPath = Join-Path ([IO.Path]::GetTempPath()) ("nexus-local-db-" + [Guid]::NewGuid().ToString("N") + ".sql")
  try {
    [IO.File]::WriteAllText($sqlPath, $sql, [Text.UTF8Encoding]::new($false))
    $null = & $psqlPath -X -w -v ON_ERROR_STOP=1 -h $dbHost -p $dbPort -U postgres -d postgres -f $sqlPath 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "PostgreSQL provisioning failed. The script removed its temporary SQL file; inspect local role/database state before retrying."
    }
  }
  finally {
    if (Test-Path -LiteralPath $sqlPath) {
      Remove-Item -LiteralPath $sqlPath -Force
    }
    $sql = $null
    $quotedPassword = $null
  }

  $encodedPassword = [Uri]::EscapeDataString($appPassword)
  $devUrl = "postgresql://${appRole}:${encodedPassword}@${dbHost}:${dbPort}/nexus_dev?schema=public"
  $testUrl = "postgresql://${appRole}:${encodedPassword}@${dbHost}:${dbPort}/nexus_test?schema=public"
  Set-DatabaseEnvironment $envPath "development" $devUrl
  Set-DatabaseEnvironment $testEnvPath "test" $testUrl
  $appPassword = $null
  $encodedPassword = $null
  $devUrl = $null
  $testUrl = $null

  Write-Host "Local role and databases created; .env and .env.test now target only 127.0.0.1."
  Write-Host "Hosted databases were not contacted. Next: apply local migrations and seed data."
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $adminPassword = $null
  $appPassword = $null
  $confirmPassword = $null
  $devUrl = $null
  $testUrl = $null
  if ($secureAppPassword) { $secureAppPassword.Dispose() }
  if ($secureAppPasswordConfirm) { $secureAppPasswordConfirm.Dispose() }
}
