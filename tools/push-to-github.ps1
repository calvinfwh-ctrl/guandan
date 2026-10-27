# 一条命令把本地仓库推到你的 GitHub
# 用法：
#   .\tools\push-to-github.ps1 https://github.com/用户名/仓库名.git
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$RepoUrl
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
    if (-not (Test-Path '.git')) { throw "当前目录不是 git 仓库：$root" }

    # 重新打包单文件版，保证 dist 是最新的
    node tools/build-single.cjs
    if ($LASTEXITCODE -ne 0) { throw "打包失败（node tools/build-single.cjs）" }

    git add -A
    $dirty = git status --porcelain
    if ($dirty) {
        git commit -m "chore: rebuild single-file bundle" | Out-Null
    }

    # 注意：不能用 git remote get-url —— 没有 origin 时它会把错误写到 stderr，
    # 在 Stop 模式下会被当成致命错误直接中止（之前就是这个坑）
    $remotes = @(git remote)
    if ($remotes -contains 'origin') {
        git remote set-url origin $RepoUrl
    } else {
        git remote add origin $RepoUrl
    }
    if ($LASTEXITCODE -ne 0) { throw "设置 remote 失败" }

    Write-Host "推送到 $RepoUrl ..." -ForegroundColor Cyan
    git push -u origin main

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "推送失败。常见原因和对策：" -ForegroundColor Yellow
        Write-Host "  1) 仓库里已有 README 等提交 -> 先执行："
        Write-Host "     git pull --allow-unrelated-histories --no-rebase origin main"
        Write-Host "     再重新运行本脚本"
        Write-Host "  2) 认证没通过 -> 会弹 Git Credential Manager，登录 GitHub 授权即可"
        Write-Host "  3) 仓库地址写错 -> 检查 https://github.com/用户名/仓库名.git"
        exit 1
    }

    Write-Host ""
    Write-Host "推送成功。" -ForegroundColor Green
    Write-Host "接下来两步："
    Write-Host "  1. 打开  https://github.com/<你的用户名>/<仓库名>/settings/pages"
    Write-Host "  2. Source 选 'GitHub Actions'，等 1 分钟"
    Write-Host "     网址：https://<你的用户名>.github.io/<仓库名>/"
}
finally {
    Pop-Location
}
