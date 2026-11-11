# YujiPhoto install / reinstall (Windows). Safe to run again after every update.
#   powershell -ExecutionPolicy Bypass -File roblox\scripts\install.ps1 [-Build] [-NoMcp]
# -Build   compile the app and CLI first (cargo build --release; needs Rust + VS C++ Build Tools)
# -NoMcp   don't register the MCP servers with Claude Code
param([switch]$Build, [switch]$NoMcp)
# cargo and npm print progress on stderr: keep going and check exit codes ourselves.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$toolkit = Join-Path $repo 'roblox'
$bin = Join-Path $env:LOCALAPPDATA 'Programs\YujiPhoto'
$workspace = Join-Path $env:USERPROFILE 'YujiVFX'
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

if ($Build) {
    Write-Host '== cargo build (app + CLI), this takes a while the first time'
    Push-Location $repo
    cargo build --release -p photocraft -p photocraft-cli
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'cargo build failed' }
    Pop-Location
}

Write-Host '== yuji-vfx toolkit (npm install)'
Push-Location $toolkit
npm install --no-fund --no-audit | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install failed" }
Pop-Location

# Copy the binaries out of target\ so `cargo clean` never breaks the app or the MCP.
$built = Join-Path $repo 'target\release'
if (Test-Path "$built\photocraft-cli.exe") {
    Write-Host "== app + CLI -> $bin"
    New-Item -ItemType Directory -Force $bin | Out-Null
    foreach ($exe in 'photocraft.exe', 'photocraft-cli.exe') {
        if (Test-Path "$built\$exe") { Copy-Item "$built\$exe" $bin -Force }
    }
    $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'YujiPhoto.lnk'
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($lnk)
    $s.TargetPath = Join-Path $bin 'photocraft.exe'
    $s.WorkingDirectory = $workspace
    $s.Description = 'YujiPhoto (PhotoCraft fork for Roblox VFX)'
    $s.Save()
} else {
    Write-Host '!! no build in target\release yet: run again with -Build'
}

New-Item -ItemType Directory -Force $workspace, (Join-Path $workspace 'effects') | Out-Null

# Skill: a junction into the repo, so `git pull` updates it too.
$skills = Join-Path $env:USERPROFILE '.claude\skills'
$link = Join-Path $skills 'roblox-vfx'
New-Item -ItemType Directory -Force $skills | Out-Null
if (Test-Path $link) { (Get-Item $link).Delete() }
New-Item -ItemType Junction -Path $link -Target (Join-Path $toolkit 'skill\roblox-vfx') | Out-Null
Write-Host "== skill roblox-vfx -> $link"

# Call claude.cmd, not claude.ps1: PowerShell strips the "--" separator when calling a .ps1.
$claude = (Get-Command claude.cmd, claude.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $NoMcp -and $claude) {
    Write-Host '== MCP servers (Claude Code, user scope)'
    foreach ($name in 'yuji-vfx', 'photocraft') { try { & $claude mcp remove -s user $name 2>$null | Out-Null } catch {} }
    & $claude mcp add yuji-vfx -s user -e "YUJI_VFX_WORKSPACE=$workspace" '--' node (Join-Path $toolkit 'src\mcp.mjs')
    if (Test-Path "$bin\photocraft-cli.exe") {
        & $claude mcp add photocraft -s user '--' "$bin\photocraft-cli.exe" mcp --automation-read-root $workspace --automation-write-root $workspace
    }
} elseif (-not $NoMcp) {
    Write-Host '!! claude CLI not on PATH: register the MCP servers by hand (see roblox\README.md)'
}

Write-Host "Done. Workspace: $workspace"
