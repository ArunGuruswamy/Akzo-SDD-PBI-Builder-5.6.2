@echo off
rem Uninstalls through Install-PBIBuilder.cmd, so the same package and execution-policy checks run first.
rem Never bypasses the execution policy. Removes only unchanged installed files, after backing them up.
setlocal
if "%~1"=="" set "PBI_PAUSE=1"
call "%~dp0Install-PBIBuilder.cmd" -Action Uninstall %*
exit /b %ERRORLEVEL%
