$blenderExe = "C:\Users\苏明恒\Desktop\blender-portable\blender-4.2.3-windows-x64\blender.exe"
$exportScript = "C:\Users\苏明恒\Desktop\fantasy3d-store\blender-export.py"
$inputDir = "D:\3D模型"
$outputDir = "D:\3D模型\_preview"
$projectModelsDir = "C:\Users\苏明恒\Desktop\fantasy3d-store\frontend\models"

$blendFiles = Get-ChildItem -Path $inputDir -Filter "*.blend" -File
$total = $blendFiles.Count
$success = 0
$failed = 0
$skipped = 0

Write-Output "Found $total BLEND files"
Write-Output "Output: $outputDir"
Write-Output ""

$i = 0
foreach ($file in $blendFiles) {
    $i++
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $glbName = $baseName + ".glb"
    $outputPath = Join-Path $outputDir $glbName
    
    if (Test-Path -LiteralPath $outputPath) {
        $skipped++
        Write-Output "[$i/$total] SKIP: $($file.Name)"
        continue
    }
    
    Write-Output "[$i/$total] CONVERT: $($file.Name)"
    
    $args = @(
        "--background",
        $file.FullName,
        "--python",
        $exportScript,
        "--",
        $outputPath
    )
    
    try {
        $process = Start-Process -FilePath $blenderExe -ArgumentList $args -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\blender_out.txt" -RedirectStandardError "$env:TEMP\blender_err.txt"
        if ($process.ExitCode -eq 0 -and (Test-Path -LiteralPath $outputPath)) {
            $success++
            Copy-Item -LiteralPath $outputPath -Destination (Join-Path $projectModelsDir $glbName) -Force
            Write-Output "  OK"
        } else {
            $failed++
            Write-Output "  FAIL (exit=$($process.ExitCode))"
        }
    } catch {
        $failed++
        Write-Output "  ERROR: $($_.Exception.Message)"
    }
}

Write-Output ""
Write-Output "=== DONE ==="
Write-Output "Total: $total"
Write-Output "Success: $success"
Write-Output "Skipped: $skipped"
Write-Output "Failed: $failed"
