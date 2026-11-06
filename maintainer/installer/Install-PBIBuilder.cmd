@echo off
rem Double-click: setup window (install, upgrade, repair, verify, uninstall). With arguments: Install-PBIBuilder.ps1.
rem First checks the package files and whether this computer's PowerShell policy lets the scripts run.
rem It never bypasses or changes the execution policy, Group Policy, AppLocker or WDAC; when they block
rem the scripts it says why and gives the compliant options. The check only reads settings and files.
rem Exit codes: 0 done, 1 PowerShell refused or failed, 2 error (changes rolled back), 3 check failed or
rem nothing written, 10 package incomplete or damaged, 11 policy needs signed scripts, 12 downloaded
rem files not unblocked, 13 application control (AppLocker/WDAC), 14 Windows PowerShell 5.1 missing.
setlocal
set "PBI_DIR=%~dp0"
where powershell.exe >nul 2>nul || (echo Windows PowerShell ^(powershell.exe^) was not found. Use Akzo-SDD-PBI-Builder.html to install or upgrade.& set "code=14"& goto end)
set "q=$d=$env:PBI_DIR;$p=[string](Get-ExecutionPolicy);"
set "q=%q%function Stop-Check($c,$m){Write-Host $m;try{$f=Join-Path $env:USERPROFILE '.akzo-pbi-builder\logs';New-Item -ItemType Directory -Force -Path $f|Out-Null;Add-Content -LiteralPath (Join-Path $f 'install.log') -Encoding UTF8 -Value (ConvertTo-Json -Compress ([ordered]@{time=(Get-Date).ToUniversalTime().ToString('o');step='preflight';package=$d;policy=$p;exitCode=$c;message=$m}))}catch{};exit $c};"
set "q=%q%$need='Install-PBIBuilder.ps1','PBI-Builder-Setup.ps1','pbi-builder-bundle.json','Akzo-SDD-PBI-Builder.html';"
set "q=%q%foreach($n in $need){if(-not(Test-Path -LiteralPath ($d+$n))){Stop-Check 10 ('Missing package file: '+$n+'. Nothing was changed. Extract the whole ZIP again, then rerun.')}};"
set "q=%q%if(Test-Path -LiteralPath ($d+'SHA256SUMS.txt')){foreach($l in Get-Content -LiteralPath ($d+'SHA256SUMS.txt')){$h,$n=$l -split '  ',2;if($n -match '^[^/]+\.(ps1|cmd|json|html)$'){$a=$null;try{$a=(Get-FileHash -LiteralPath ($d+$n) -Algorithm SHA256).Hash}catch{};if($a -ne $h){Stop-Check 10 ('Package file missing or changed: '+$n+'. Nothing was changed. Extract the original ZIP again, then rerun.')}}}};"
set "q=%q%if($PSVersionTable.PSVersion.Major -lt 5){Stop-Check 14 'Windows PowerShell 5.1 is required. Nothing was changed. Use Akzo-SDD-PBI-Builder.html to install or upgrade.'};"
set "q=%q%$alt=' Nothing was changed. Compliant options: (1) install or upgrade without PowerShell: open Akzo-SDD-PBI-Builder.html in Edge or Chrome; (2) ask IT for the organization-signed package. See If the installer is blocked in README-FIRST.txt.';"
set "q=%q%$lm=[string]$ExecutionContext.SessionState.LanguageMode;if($lm -ne 'FullLanguage'){Stop-Check 13 ('Application control (AppLocker or WDAC) runs PowerShell in '+$lm+' mode on this computer, so the installer cannot run. The Builder does not work around it.'+$alt)};"
set "q=%q%$ps=@($need -like '*.ps1');$unsigned=@($ps|Where-Object{(Get-AuthenticodeSignature -LiteralPath ($d+$_)).Status -ne 'Valid'});$marked=@($ps|Where-Object{Get-Item -LiteralPath ($d+$_) -Stream Zone.Identifier -ErrorAction SilentlyContinue});"
set "q=%q%if($p -eq 'Bypass' -or $p -eq 'Unrestricted' -or ($p -eq 'RemoteSigned' -and ($marked.Count -eq 0 -or $unsigned.Count -eq 0)) -or ($p -eq 'AllSigned' -and $unsigned.Count -eq 0)){exit 0};"
set "q=%q%$gpo=@('MachinePolicy','UserPolicy'|Where-Object{[string](Get-ExecutionPolicy -Scope $_) -ne 'Undefined'}).Count -gt 0;$by=if($gpo){'set by Group Policy'}else{'set on this computer'};"
set "q=%q%if($p -eq 'RemoteSigned'){Stop-Check 12 ('Your execution policy is RemoteSigned ('+$by+'). Windows marks these package files as downloaded from the internet, and that policy runs downloaded scripts only when they are signed. Removing the mark from the files you downloaded (Unblock-File) is the standard Windows step; it does not change the policy.')};"
set "q=%q%$own=if($gpo){''}else{' (3) only if your IT rules allow it: run Set-ExecutionPolicy -Scope CurrentUser RemoteSigned in PowerShell, then rerun.'};Stop-Check 11 ('Your execution policy is '+$p+' ('+$by+') and the installer scripts are not signed by a publisher this computer trusts. The Builder will not bypass it.'+$alt+$own)"
:check
powershell.exe -NoProfile -NonInteractive -Command "%q%"
set "code=%ERRORLEVEL%"
if "%code%"=="12" goto unblock
if not "%code%"=="0" goto end
if "%~1"=="" (
  powershell.exe -NoProfile -STA -File "%~dp0PBI-Builder-Setup.ps1"
) else (
  powershell.exe -NoProfile -File "%~dp0Install-PBIBuilder.ps1" %*
)
set "code=%ERRORLEVEL%"
if "%code%"=="1" echo.& echo PowerShell stopped the installer. If it said a script is not signed or running scripts is disabled, see "If the installer is blocked" in README-FIRST.txt.
goto end
:unblock
if defined PBI_UNBLOCKED goto end
echo.
choice /C YN /M "Remove the downloaded mark from the files in this package folder only"
if not "%ERRORLEVEL%"=="1" (echo Nothing was changed. Compliant options: open Akzo-SDD-PBI-Builder.html in Edge or Chrome, or ask IT for the organization-signed package.& goto end)
powershell.exe -NoProfile -NonInteractive -Command "Get-ChildItem -LiteralPath $env:PBI_DIR -File | Unblock-File"
set "PBI_UNBLOCKED=1"
goto check
:end
if not "%code%"=="0" if not "%code%"=="1" if not "%code%"=="2" if not "%code%"=="3" echo Details: %USERPROFILE%\.akzo-pbi-builder\logs\install.log
if defined PBI_PAUSE (pause) else if "%~1"=="" if not "%code%"=="0" pause
exit /b %code%
