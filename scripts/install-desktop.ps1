$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskInstaller = Join-Path $taskProject 'dist/Fantasy3D-Store-Setup-1.0.0.exe'
if (-not (Test-Path -LiteralPath $taskInstaller -PathType Leaf)) { throw 'Installer has not finished building.' }
$taskDesktop = [Environment]::GetFolderPath('Desktop')
$taskDesktopProject = Join-Path $taskDesktop 'fantasy3d-store'
if (Test-Path -LiteralPath $taskDesktopProject) { throw 'Desktop project already exists; inspect before replacing any files.' }
New-Item -ItemType Directory -Path $taskDesktopProject | Out-Null
foreach ($taskName in @('server.js','electron-main.js','package.json','pnpm-lock.yaml','.npmrc','.gitignore','README.md','VERIFICATION.md','frontend','tests','scripts')) {
  $taskSource = Join-Path $taskProject $taskName
  if (Test-Path -LiteralPath $taskSource) { Copy-Item -LiteralPath $taskSource -Destination $taskDesktopProject -Recurse }
}
$taskDesktopDist = Join-Path $taskDesktopProject 'dist'
New-Item -ItemType Directory -Path $taskDesktopDist | Out-Null
Copy-Item -LiteralPath $taskInstaller -Destination $taskDesktopDist
$taskSourceArchive = Join-Path $taskProject 'dist/Fantasy3D-Store-Source-1.0.0.zip'
if (Test-Path -LiteralPath $taskSourceArchive) { Copy-Item -LiteralPath $taskSourceArchive -Destination $taskDesktopDist }
$taskCopy = Join-Path $taskDesktopDist (Split-Path -Leaf $taskInstaller)
if ((Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $taskCopy -Algorithm SHA256).Hash) { throw 'Installer copy hash mismatch.' }

# Install only this locally built, current-user application. No elevation or system-wide install.
$taskInstallProcess = Start-Process -FilePath $taskCopy -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($taskInstallProcess.ExitCode -ne 0) { throw "Installer failed: $($taskInstallProcess.ExitCode)" }
$taskLink = Join-Path $taskDesktop 'Fantasy3D 资产商店.lnk'
if (-not (Test-Path -LiteralPath $taskLink)) { throw 'Installation ended but the expected desktop shortcut was not found.' }
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcut = $taskShell.CreateShortcut($taskLink)
$taskInstalledExe = $taskShortcut.TargetPath
if (-not (Test-Path -LiteralPath $taskInstalledExe -PathType Leaf)) { throw 'Desktop shortcut does not point to an installed executable.' }
if ((Split-Path -Leaf $taskInstalledExe) -ne 'Fantasy3D 资产商店.exe') { throw 'Unexpected installed executable.' }

# Remove only the earlier shortcut this task created for the static HTML preview.
$taskOldLink = Join-Path $taskDesktop 'Fantasy3D 资产商店（展示版）.lnk'
if (Test-Path -LiteralPath $taskOldLink) {
  $taskOldShortcut = $taskShell.CreateShortcut($taskOldLink)
  $taskOldPreview = Join-Path (Split-Path -Parent $taskProject) 'Fantasy3D-Desktop/index.html'
  $taskOldArguments = '--app="' + [Uri]::new($taskOldPreview).AbsoluteUri + '"'
  if ($taskOldShortcut.Arguments -eq $taskOldArguments -and $taskOldShortcut.TargetPath -like '*\Microsoft\Edge\Application\msedge.exe') {
    Remove-Item -LiteralPath $taskOldLink
  }
}
$taskResult = [ordered]@{installedExe=$taskInstalledExe;desktopShortcut=$taskLink;desktopProject=$taskDesktopProject;installer=$taskCopy;installerExitCode=$taskInstallProcess.ExitCode}
$taskResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskProject 'installation-result.json') -Encoding utf8
$taskResult | ConvertTo-Json
Start-Process -FilePath $taskInstalledExe
