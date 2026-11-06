@echo off
rem Same as Install-PBIBuilder.cmd: double-click for the setup window, or pass Install-PBIBuilder.ps1 arguments.
call "%~dp0Install-PBIBuilder.cmd" %*
exit /b %ERRORLEVEL%
