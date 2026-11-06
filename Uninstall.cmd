@echo off
rem Same as Uninstall-PBIBuilder.cmd: double-click to pick the repository, or pass -RepoPath and -Preview.
call "%~dp0Uninstall-PBIBuilder.cmd" %*
exit /b %ERRORLEVEL%
