# Pull the latest PhotoCraft (upstream) into YujiPhoto, rebuild, reinstall, push to your fork.
#   powershell -ExecutionPolicy Bypass -File roblox\scripts\update.ps1 [-NoPush]
# Your Roblox work lives in roblox\ only, so upstream merges almost never conflict.
param([switch]$NoPush)
# git prints progress on stderr: keep going and check exit codes ourselves.
$ErrorActionPreference = 'Continue'
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed" } }
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
Push-Location $repo
try {
    if (git status --porcelain) { throw 'Uncommitted changes: commit or stash them first.' }
    if (-not (git remote | Select-String -SimpleMatch 'upstream')) {
        git remote add upstream https://github.com/storytold/photocraft.git
    }
    git checkout -q main; Check 'git checkout main'
    git pull --ff-only origin main; Check 'git pull'
    git fetch upstream main; Check 'git fetch upstream'
    $before = git rev-parse HEAD
    git merge --no-edit upstream/main
    if ($LASTEXITCODE -ne 0) { throw 'Merge conflict: fix the files git lists, then git commit and run this again.' }
    if ((git rev-parse HEAD) -eq $before) { Write-Host 'Already up to date with PhotoCraft.' }
    & "$PSScriptRoot\install.ps1" -Build
    if (-not $NoPush) { git push origin main; Check 'git push' }
} finally {
    Pop-Location
}
