$blenderExe = "C:\Users\苏明恒\Desktop\blender-portable\blender-4.2.3-windows-x64\blender.exe"
$exportScript = "C:\Users\苏明恒\Desktop\fantasy3d-store\blender-export.py"
$inputDir = "D:\3D模型"
$outputDir = "D:\3D模型\_preview"
$projectModelsDir = "C:\Users\苏明恒\Desktop\fantasy3d-store\frontend\models"

if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
if (-not (Test-Path $projectModelsDir)) { New-Item -ItemType Directory -Path $projectModelsDir -Force | Out-Null }

$blendFiles = Get-ChildItem $inputDir -Filter "*.blend"
$total = $blendFiles.Count
$success = 0
$failed = 0
$skipped = 0

Write-Output "开始转换 $total 个 BLEND 文件..."
Write-Output "输出目录: $outputDir"
Write-Output ""

$i = 0
foreach ($file in $blendFiles) {
    $i++
    $glbName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name) + ".glb"
    $outputPath = Join-Path $outputDir $glbName
    
    # 如果已经转换过，跳过
    if (Test-Path $outputPath) {
        $skipped++
        Write-Output "[$i/$total] 跳过(已存在): $($file.Name)"
        continue
    }
    
    Write-Output "[$i/$total] 转换: $($file.Name)"
    
    try {
        $process = Start-Process -FilePath $blenderExe -ArgumentList "--background", "`"$($file.FullName)`"", "--python", "`"$exportScript`"", "--", "`"$outputPath`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\blender_out.txt" -RedirectStandardError "$env:TEMP\blender_err.txt"
        if ($process.ExitCode -eq 0 -and (Test-Path $outputPath)) {
            $success++
            # 同时复制到项目models目录
            Copy-Item $outputPath (Join-Path $projectModelsDir $glbName) -Force
            Write-Output "  ✓ 成功"
        } else {
            $failed++
            Write-Output "  ✗ 失败 (ExitCode: $($process.ExitCode))"
        }
    } catch {
        $failed++
        Write-Output "  ✗ 错误: $($_.Exception.Message)"
    }
}

Write-Output ""
Write-Output "=== 转换完成 ==="
Write-Output "总计: $total"
Write-Output "成功: $success"
Write-Output "跳过: $skipped"
Write-Output "失败: $failed"
