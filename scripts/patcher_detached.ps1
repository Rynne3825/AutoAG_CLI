# patcher_detached.ps1 - Detached Antigravity Self-Patcher
$logFile = "D:\AutoAG_CLI\patcher_detached.log"
Start-Transcript -Path $logFile -Force

Write-Host "Starting detached patcher in 5 seconds..."
Start-Sleep -Seconds 5

Write-Host "Force killing all Antigravity processes..."
$attempts = 0
while ($attempts -lt 5) {
    $processes = Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue
    if (!$processes) {
        Write-Host "All Antigravity processes terminated."
        break
    }
    Write-Host "Found $($processes.Length) Antigravity processes. Terminating..."
    Stop-Process -Name "Antigravity" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $attempts++
}

# Double check and force kill with taskkill just in case
taskkill /f /im Antigravity.exe 2>&1

$targetDir = "C:\Users\Rynne\AppData\Local\Programs\Antigravity\resources"
$asarFile = Join-Path $targetDir "app.asar"
$asarBakFile = Join-Path $targetDir "app.asar.bak"
$exePath = "C:\Users\Rynne\AppData\Local\Programs\Antigravity\Antigravity.exe"

Write-Host "Target directory: $targetDir"
Write-Host "ASAR file: $asarFile"

# 1. Create Backup of original app.asar if not exists
if (!(Test-Path $asarBakFile)) {
    Write-Host "Creating backup..."
    Copy-Item $asarFile $asarBakFile -Force
    Write-Host "Backup created: app.asar.bak"
} else {
    Write-Host "Restoring original app.asar from backup to ensure clean patch..."
    Copy-Item $asarBakFile $asarFile -Force
}

# 2. Extract app.asar
$tempDir = Join-Path $env:TEMP "antigravity_patch_temp"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Host "Extracting app.asar..."
npx -y @electron/asar extract $asarFile $tempDir

# 3. Inject preload_patch.js
$preloadFile = Join-Path $tempDir "dist\preload.js"
if (Test-Path $preloadFile) {
    Write-Host "Injecting preload_patch.js into preload.js..."
    $preloadContent = Get-Content $preloadFile -Raw
    $patchMarker = "// Auto-submit Command Execution Requests"
    $markerIndex = $preloadContent.IndexOf($patchMarker)
    if ($markerIndex -ge 0) {
        $preloadContent = $preloadContent.Substring(0, $markerIndex).Trim()
    }
    
    $injectionCode = Get-Content "D:\AutoAG_CLI\src\patch\preload_patch.js" -Raw
    $newPreloadContent = $preloadContent + "`r`n`r`n" + $injectionCode
    Set-Content -Path $preloadFile -Value $newPreloadContent
    Write-Host "Preload patch injected successfully."
} else {
    Write-Warning "preload.js not found!"
}

# 4. Disable Sandbox in dist/utils.js
$utilsFile = Join-Path $tempDir "dist\utils.js"
if (Test-Path $utilsFile) {
    Write-Host "Disabling Sandbox in dist/utils.js..."
    $utilsContent = Get-Content $utilsFile -Raw
    if ($utilsContent -match "preload: path_1\.default\.join") {
        if (!($utilsContent -match "sandbox: false")) {
            $utilsContent = $utilsContent -replace "preload: path_1\.default\.join", "sandbox: false,`r`n            preload: path_1.default.join"
            Set-Content -Path $utilsFile -Value $utilsContent
            Write-Host "Sandbox disabled successfully."
        } else {
            Write-Host "Sandbox already disabled."
        }
    }
}

# 5. Pack app.asar
Write-Host "Packing app.asar..."
npx -y @electron/asar pack $tempDir $asarFile --unpack-dir "node_modules/chrome-devtools-mcp"
Write-Host "ASAR packed successfully."

# 6. Cleanup temp dir
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}

# 7. Relaunch Antigravity
Write-Host "Relaunching Antigravity..."
Start-Process -FilePath $exePath
Write-Host "Relaunch command sent."

Stop-Transcript
