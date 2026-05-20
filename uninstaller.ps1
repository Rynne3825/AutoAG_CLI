# uninstaller.ps1 - Automated Antigravity Restorer
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "    AutoAG CLI - Automated Uninstaller    " -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow

# 1. Locate Antigravity Installation
$localPath = Join-Path $env:LOCALAPPDATA "Programs\Antigravity\resources"
$programFilesPath = Join-Path $env:ProgramFiles "Antigravity\resources"
$targetDir = $null

if (Test-Path $localPath) {
    $targetDir = $localPath
} elseif (Test-Path $programFilesPath) {
    $targetDir = $programFilesPath
} else {
    Write-Error "Không tìm thấy thư mục cài đặt của Antigravity!"
    Exit 1
}

$asarFile = Join-Path $targetDir "app.asar"
$asarBakFile = Join-Path $targetDir "app.asar.bak"

# 2. Check and Restore Backup
if (Test-Path $asarBakFile) {
    Write-Host "Đang khôi phục tệp app.asar gốc..." -ForegroundColor Yellow
    
    # Overwrite app.asar with backup
    Copy-Item $asarBakFile $asarFile -Force
    Remove-Item $asarBakFile -Force
    
    Write-Host "Khôi phục thành công! Đã xóa tệp sao lưu." -ForegroundColor Green
} else {
    Write-Host "Không tìm thấy tệp sao lưu app.asar.bak! Có vẻ như Antigravity đang ở trạng thái gốc." -ForegroundColor Green
}

# 3. Clean up registry startup key
Write-Host "Đang xóa cấu hình khởi động cùng Windows..." -ForegroundColor Yellow
try {
    $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    if (Get-ItemProperty -Path $regPath -Name "AutoAG_Tray" -ErrorAction SilentlyContinue) {
        Remove-ItemProperty -Path $regPath -Name "AutoAG_Tray"
        Write-Host "Đã xóa khóa Registry khởi động cùng Windows." -ForegroundColor Green
    } else {
        Write-Host "Khóa Registry không tồn tại từ trước." -ForegroundColor Green
    }
} catch {
    Write-Warning "Không thể xóa Registry key (có thể do quyền hạn). Vui lòng tắt thủ công nếu cần."
}

# 4. Clean up configurations
$settingsFile = Join-Path $env:USERPROFILE ".gemini\antigravity\autosubmit.json"
if (Test-Path $settingsFile) {
    Write-Host "Đang xóa tệp cấu hình autosubmit.json..." -ForegroundColor Yellow
    Remove-Item $settingsFile -Force
    Write-Host "Đã xóa tệp cấu hình." -ForegroundColor Green
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host " GỠ CÀI ĐẶT THÀNH CÔNG!                     " -ForegroundColor Green
Write-Host " Vui lòng khởi động lại ứng dụng           " -ForegroundColor Green
Write-Host " Antigravity để hoàn tất khôi phục.        " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
