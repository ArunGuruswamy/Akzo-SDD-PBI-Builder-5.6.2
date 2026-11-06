<#
.SYNOPSIS
Removes the Akzo SDD PBI Builder setup files from a repository.

.DESCRIPTION
Removes only files recorded in the installation manifest that are unchanged since
installation, plus unchanged comparison baseline agents. Backs them up first.
Always keeps playbook/pbis (PBIs, decisions, approvals, history), knowledge notes,
backups and any edited file. Use -Preview to see what would be removed.

.EXAMPLE
.\Uninstall-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -Preview
#>
[CmdletBinding()]
param([string]$RepoPath, [switch]$Preview)
& (Join-Path $PSScriptRoot 'Install-PBIBuilder.ps1') -Action Uninstall @PSBoundParameters
exit $LASTEXITCODE
