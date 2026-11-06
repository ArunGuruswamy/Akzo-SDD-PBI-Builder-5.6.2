# Installer parity: HTML form and PowerShell

Both installers use one engine. `maintainer/src/core.js` produces the installed files
and the plan, apply, backup, rollback and uninstall rules. The HTML form runs it
directly. The PowerShell installer reads `pbi-builder-bundle.json`, which is
generated from the same core.js, and mirrors its plan, apply and uninstall step by
step. `maintainer/test-ps.cjs` runs both on real folders and compares the results
file by file, so the two cannot drift without a failing test.

## Capability matrix

| Capability | HTML form | PowerShell (Install.cmd / setup window / parameters) | Test |
| --- | --- | --- | --- |
| Choose a repository with the native Windows folder dialog | Choose project folder | Add repository... | test-ui (simulated picker); window not automated |
| Type or paste a path | Not possible: browsers only open folders chosen in their dialog | Add by path..., `-RepoPath` | test-ps |
| Validate the path (exists, Git root, warning when no .git) | Yes | Yes | test-ui, test-ps |
| Detect project (solutions up to 3 levels, Git root) | Yes | Discover sources in form; agent maps projects | test-ui |
| Show installed version and whether an update is available | Yes | Yes | test-ui, test-ps |
| Several repositories, each with its own config.json | This session (list) | Remembered list | test-ui, test-ps |
| Upgrade every listed repository in one action | No: the browser needs a folder dialog per repository | Upgrade all | test-ps |
| Settings: project name, editor, role, other sources, historical reports | Yes | Yes (same defaults) | test-ps (identical files) |
| Legacy, CDMS, DAB, shared Angular UI and other repositories | Typed paths (`Name = path`); the browser cannot reveal a folder's path | Repositories... with Browse per repository, `-LegacySource`, `-UiSource`, `-OtherSource "Name=path;..."` | test-ui, test-ps (identical files) |
| Legacy repository, development target and analysis mode per PBI | New PBI steps 2 to 4 | Copilot Start PBI questions | test-core, test-ui |
| Additional implementation references per PBI | Add implementation references | Copilot Start PBI | test-core (every combination), test-ui |
| Review & approve: one final approval, generation of the final PBIs (MD, DOCX, JSON), verified downloads | Continue tab | Not offered: PBI work is in the form and Copilot; `-Action CheckPbi` gives the same readiness result | test-core, test-ui |
| Review before writing: same summary (Repository, Agent, Review counts, retire/conflict notes), "Apply these changes?", then "Allow updates...?" when needed, same result messages | Review setup; Install and Repair ask in dialogs | Preview / console questions | test-ui, test-ps |
| Install and upgrade with backups, ownership check and rollback | Yes | Yes | test-core, test-ps |
| Retire unchanged earlier-version files; keep edited ones | Yes | Yes | test-ps (v2.1 and 3.0.0 upgrades) |
| Repair (installed settings, updates allowed, edits never overwritten) | Repair | Repair | test-ui, test-ps |
| Verify against SHA-256 install record | Check installed files | Verify | test-ui, test-ps |
| Uninstall (backup first, keep PBIs, knowledge, backups, edited files) | Uninstall (asks first) | Uninstall | test-core, test-ui, test-ps (identical result) |
| Rollback when a write or removal fails | Yes | Yes, also on Ctrl+C | test-core, test-ps |
| Interrupted install (process killed) | Rerun Install | Rerun Install | test-ps |
| Package integrity (SHA256SUMS.txt) before running | Browser loads one self-contained file | Checked by the launcher | test-ps |
| Execution-policy and AppLocker/WDAC detection | Not needed: runs no scripts | Launcher, never bypassed | test-ps |
| Log file | On-screen messages only (the page cannot write outside the chosen folder) | `%USERPROFILE%\.akzo-pbi-builder\logs\install.log` | test-ps |
| Readiness check, evidence refresh | Yes | `-Action CheckPbi`, `-Action RefreshEvidence` | test-ps (identical output) |
| Setup ZIP for manual copy | Yes | No | test-ui |

Four rows differ, and the browser itself forbids each one: typing a path, batch
upgrade, a log file outside the chosen folder, and policy detection (the form needs
none). Everything a user can do to one repository can be done from either interface.

## Why there is no local backend for the HTML form
A browser page cannot run PowerShell. To make it do so would need a local web
server or protocol handler that runs installer commands for the page. That server
would itself be a PowerShell or executable component. So the same execution
policy, AppLocker or WDAC rule that blocks the scripts would block it, and it
would add a local endpoint that other pages could try to call. Instead, the form
writes through the browser's File System Access API, and only to the folder the
user picks. That is the authorized mechanism, and it is why the form works where
scripts are blocked.

## Reference: C:\src\Akzo-Agent installer (reviewed 29 October 2026)
Files read: `Install-MasterAgent.cmd`, `scripts/Install-MasterAgent.ps1`,
`scripts/install.ps1` (Test-RepoPath, Add/Edit/Remove-Repository) and
`installation-guide.html` (documentation only; it is not an installer).
- Folder selection is a Windows Forms dialog with a path text box, Browse...
  (FolderBrowserDialog preset to the current path), Validate and Save. Pasted
  quotes and trailing slashes are removed. Validation is Valid (has .git),
  Warning (no .git; the user confirms) or Invalid (missing or unreadable).
  Selected paths reach the engine as arguments of a child `powershell.exe`.
- Adopted here: Add by path... with the same quote and slash cleanup, the same
  Valid/Warning/Invalid checks, and the existing FolderBrowserDialog.
- Not adopted: its launcher starts PowerShell with `-ExecutionPolicy Bypass`.
  This package never does that.
