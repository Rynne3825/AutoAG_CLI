# patcher.ps1 - Automated Antigravity Patcher (ASCII Safe Version)
param(
    [switch]$NoKill
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "    AutoAG CLI - Automated Installer      " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Locate Antigravity Installation
$localPath = Join-Path $env:LOCALAPPDATA "Programs\Antigravity\resources"
$programFilesPath = Join-Path $env:ProgramFiles "Antigravity\resources"
$targetDir = $null

if (Test-Path $localPath) {
    $targetDir = $localPath
} elseif (Test-Path $programFilesPath) {
    $targetDir = $programFilesPath
} else {
    Write-Error "Khong tim thay thu muc cai dat cua Antigravity! Vui long dam bao phan mem da duoc cai dat."
    Exit 1
}

$asarFile = Join-Path $targetDir "app.asar"
$asarBakFile = Join-Path $targetDir "app.asar.bak"
$exePath = Join-Path (Split-Path -Parent $targetDir) "Antigravity.exe"

Write-Host "Da tim thay Antigravity tai: $targetDir" -ForegroundColor Green

# 2. Check for app.asar
if (!(Test-Path $asarFile)) {
    Write-Error "Khong tim thay tep app.asar tai thu muc cai dat!"
    Exit 1
}

# 2.5 Quick check if app.asar is already patched to prevent unnecessary closing
Write-Host "Dang kiem tra trang thai ban va..." -ForegroundColor Yellow
$isPatched = Select-String -Path $asarFile -Pattern "Auto-submit Command Execution Requests" -Quiet

if ($isPatched -and !$NoKill) {
    Write-Host "Antigravity da duoc va tu truoc! Khong can thuc hien lai." -ForegroundColor Green
    Exit 0
}

# 2.6 Close Antigravity if it is running to prevent file locks (Skipped if -NoKill is specified)
$antigravityProcess = Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue
$wasRunning = $false

if ($antigravityProcess) {
    if ($NoKill) {
        Write-Host "Phat hien Antigravity dang chay, nhung bo qua vi co tham so -NoKill." -ForegroundColor Yellow
    } else {
        $wasRunning = $true
        Write-Host "Phat hien Antigravity dang chay. Dang tu dong dong de ap dung ban va..." -ForegroundColor Yellow
        Stop-Process -Name "Antigravity" -Force
        Start-Sleep -Seconds 1.5
    }
}

# 3. Create Backup
if (!(Test-Path $asarBakFile)) {
    Write-Host "Dang tao ban sao luu cho app.asar goc..." -ForegroundColor Yellow
    Copy-Item $asarFile $asarBakFile
    Write-Host "Da luu ban goc tai: app.asar.bak" -ForegroundColor Green
} else {
    Write-Host "Da ton tai tep sao luu app.asar.bak." -ForegroundColor Green
}

# 4. Create Temporary Unpack Directory
$tempDir = Join-Path $env:TEMP "antigravity_patch_temp"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 5. Extract ASAR Archive
Write-Host "Dang giai nen goi app.asar..." -ForegroundColor Yellow
try {
    # Call npx directly
    $null = npx -y @electron/asar extract $asarFile $tempDir
    if ($LASTEXITCODE -ne 0) {
        throw "Loi khi giai nen tep asar."
    }
} catch {
    Write-Error "Khong the giai nen app.asar! Vui long dam bao may tinh da cai dat Node.js va npx."
    Exit 1
}

# 6. Inject Code into preload.js
$preloadFile = Join-Path $tempDir "dist\preload.js"
if (!(Test-Path $preloadFile)) {
    Write-Error "Khong tim thay tep dist/preload.js trong app.asar!"
    Exit 1
}

$preloadContent = Get-Content $preloadFile -Raw
if ($preloadContent -match "Auto-submit Command Execution Requests") {
    Write-Host "Antigravity da duoc va tu truoc!" -ForegroundColor Green
} else {
    Write-Host "Dang tiem ma tu dong phe duyet lenh..." -ForegroundColor Yellow
    
    # Read the patch JavaScript file from the same directory as this script
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrEmpty($scriptDir)) {
        $scriptDir = $PSScriptRoot
    }
    if ([string]::IsNullOrEmpty($scriptDir)) {
        $scriptDir = "."
    }
    $patchFile = Join-Path $scriptDir "preload_patch.js"
    if (!(Test-Path $patchFile)) {
        Write-Error "Khong tim thay tep preload_patch.js tai $patchFile! Vui long dam bao tep nay nam cung thu muc voi script cai dat."
        Exit 1
    }
    
    $injectionCode = Get-Content $patchFile -Raw
    $newPreloadContent = $preloadContent + "`r`n" + $injectionCode
    Set-Content -Path $preloadFile -Value $newPreloadContent
    Write-Host "Da tiem ma thanh cong!" -ForegroundColor Green
}

# 6.5 Inject sandbox: false into dist/utils.js to enable full Node.js APIs in preload
$utilsFile = Join-Path $tempDir "dist\utils.js"
if (Test-Path $utilsFile) {
    $utilsContent = Get-Content $utilsFile -Raw
    if ($utilsContent -match "preload: path_1\.default\.join") {
        if (!($utilsContent -match "sandbox: false")) {
            Write-Host "Dang vo hieu hoa Sandbox trong dist/utils.js..." -ForegroundColor Yellow
            $utilsContent = $utilsContent -replace "preload: path_1\.default\.join", "sandbox: false,`r`n            preload: path_1.default.join"
            Set-Content -Path $utilsFile -Value $utilsContent
            Write-Host "Da vo hieu hoa Sandbox thanh cong!" -ForegroundColor Green
        } else {
            Write-Host "Sandbox da duoc vo hieu hoa truoc do!" -ForegroundColor Green
        }
    }
}

# 7. Package ASAR Archive
Write-Host "Dang dong goi lai app.asar..." -ForegroundColor Yellow
try {
    # Call npx directly
    $null = npx -y @electron/asar pack $tempDir $asarFile
    if ($LASTEXITCODE -ne 0) {
        throw "Loi khi dong goi lai tep asar."
    }
    Write-Host "Dong goi app.asar thanh cong!" -ForegroundColor Green
} catch {
    Write-Error "Khong the dong goi lai app.asar!"
    Exit 1
}

# 8. Cleanup Temp Dir
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}

# 9. Create default settings
$userProfile = $env:USERPROFILE
$settingsDir = Join-Path $userProfile ".gemini\antigravity"
$settingsFile = Join-Path $settingsDir "autosubmit.json"
if (!(Test-Path $settingsFile)) {
    if (!(Test-Path $settingsDir)) {
        New-Item -ItemType Directory -Path $settingsDir | Out-Null
    }
    $defaultSettings = '{"enabled": true}'
    Set-Content -Path $settingsFile -Value $defaultSettings
}

# 10. Restart Antigravity if it was running (Only if not -NoKill)
if ($wasRunning -and !$NoKill -and (Test-Path $exePath)) {
    Write-Host "Dang tu dong khoi dong lai Antigravity..." -ForegroundColor Green
    Start-Process -FilePath $exePath
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host " CAI DAT BAN VA THANH CONG!                " -ForegroundColor Green
if ($wasRunning) {
    Write-Host " Da tu dong khoi dong lai Antigravity!     " -ForegroundColor Green
} else {
    Write-Host " Vui long mo lai ung dung Antigravity.     " -ForegroundColor Green
}
Write-Host "==========================================" -ForegroundColor Green
