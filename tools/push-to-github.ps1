# 一条命令把本地仓库推到你的 GitHub
# 用法：
#   .\tools\push-to-github.ps1 https://github.com/你的用户名/仓库名.git
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$RepoUrl
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path '.git')) { throw "当前目录不是 git 仓库" }

# 重新打包，确保 dist 是最新的
node tools/build-single.cjs
git add -A
if (git status --porcelain) {
    git commit -m "chore: rebuild single-file bundle" | Out-Null
}

$existing = git remote get-url origin 2>$null
if ($existing) { git remote set-url origin $RepoUrl } else { git remote add origin $RepoUrl }

Write-Host "推送到 $RepoUrl ..." -ForegroundColor Cyan
git push -u origin main

Write-Host ""
Write-Host "成功。接下来：" -ForegroundColor Green
Write-Host "  1. 打开仓库 Settings -> Pages -> Source，选 'GitHub Actions'"
Write-Host "  2. 等 1 分钟，网址是 https://<用户名>.github.io/<仓库名>/"
