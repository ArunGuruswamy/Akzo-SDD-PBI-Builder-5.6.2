<#
.SYNOPSIS
One-window setup for the Akzo SDD PBI Builder: choose where to install it and which
repositories it reads, then install, upgrade, repair, verify or uninstall it.

.DESCRIPTION
Started by Install-PBIBuilder.cmd when it is double-clicked. Every action runs
Install-PBIBuilder.ps1 in a child Windows PowerShell under your execution policy,
so its review, conflict protection, backups and rollback apply unchanged. Actions run
in the background with a progress line, so the window stays responsive.
The installation location (the repository that holds playbook\pbi-builder) is chosen
separately from the repositories it reads: the Legacy CRM/XRM source first, then CDMS BL,
DAB BL, Shared Angular UI, an optional GraphQL schema folder and custom references. They
are read-only references; setup never selects a PBI implementation target. Every Browse
opens the Windows folder picker (IFileDialog, folders only); every path can also be typed
or pasted, and is validated beside its field.
Install / Upgrade first shows the planned changes and asks before writing; files you
edited are never overwritten. Installation locations are remembered in
%USERPROFILE%\.akzo-pbi-builder\repositories.txt (paths only).

.EXAMPLE
.\PBI-Builder-Setup.ps1
.EXAMPLE
.\PBI-Builder-Setup.ps1 -NoGui -Action Install -Repo "C:\src\My Repo" -Ide vscode -Role dab
.EXAMPLE
.\PBI-Builder-Setup.ps1 -NoGui -Action Install -Repo "C:\src\My Repo" -Ide both -Role other
(Visual Studio 2026 and VS Code: one agent file for each editor; every other file is shared.)
.EXAMPLE
.\PBI-Builder-Setup.ps1 -NoGui -Action Upgrade
.EXAMPLE
.\PBI-Builder-Setup.ps1 -NoGui -Action Detect -Repo "C:\src\Legacy"
(Read-only: solutions, projects, frameworks and architecture of a source folder, as the window shows them.)
.EXAMPLE
.\PBI-Builder-Setup.ps1 -NoGui -Action WindowTest -Repo "C:\src\My Repo" -Set "cdms=C:\src\CDMS|ui=C:\src\UI"
(Builds the window without showing it and prints its fields, statuses and installer arguments as JSON; for tests.)
#>
[CmdletBinding()]
param(
    [ValidateSet('', 'Install', 'Upgrade', 'Repair', 'Verify', 'Uninstall', 'Status', 'Detect', 'WindowTest')]
    [string]$Action = '',
    [string[]]$Repo,
    [ValidateSet('visualstudio', 'vscode', 'both')][string]$Ide = 'visualstudio',
    [ValidateSet('legacy', 'dab', 'cdms', 'ui', 'other')][string]$Role = 'legacy',
    [string]$Set,
    [switch]$NoGui,
    [string]$HomeRoot = $env:USERPROFILE
)
$ErrorActionPreference = 'Stop'
$Engine = Join-Path $PSScriptRoot 'Install-PBIBuilder.ps1'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$BundleInfo = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'pbi-builder-bundle.json'), $Utf8) | ConvertFrom-Json
$PackageVersion = $BundleInfo.packageVersion
# Editors (config.json ide: visualstudio, vscode or both) and their agent files, as editorAgents() in core.js.
$EditorLabels = [ordered]@{ visualstudio = 'Visual Studio 2026'; vscode = 'VS Code' }
function Get-EditorAgents([string]$ide) { if ($ide -eq 'both') { return [ordered]@{ visualstudio = [string]$BundleInfo.agentPath; vscode = [string]$BundleInfo.vscodeAgentPath } }; return [ordered]@{ $(if ($ide -eq 'vscode') { 'vscode' } else { 'visualstudio' }) = [string]$BundleInfo.agentPath } }
$Registry = Join-Path $HomeRoot '.akzo-pbi-builder\repositories.txt'
$LastFile = Join-Path $HomeRoot '.akzo-pbi-builder\last-installation.txt'

function Get-Repos {
    if (-not (Test-Path -LiteralPath $Registry)) { return @() }
    return @([System.IO.File]::ReadAllLines($Registry, $Utf8) | Where-Object { $_.Trim() } | Sort-Object -Unique)
}
function Save-Repos([string[]]$list) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Registry) | Out-Null
    [System.IO.File]::WriteAllLines($Registry, [string[]]@($list | Where-Object { $_ } | Sort-Object -Unique), $Utf8)
}
function Add-Repo([string]$path) { Save-Repos (@(Get-Repos) + (Resolve-Path -LiteralPath $path).ProviderPath) }
function Remove-Repo([string]$path) { Save-Repos @(Get-Repos | Where-Object { $_ -ne $path }) }
function Get-InstalledVersion([string]$path) {
    $m = Join-Path $path 'playbook\pbi-builder\installed-files.json'
    if (-not (Test-Path -LiteralPath $m)) { return $null }
    try { return ([System.IO.File]::ReadAllText($m, $Utf8) | ConvertFrom-Json).packageVersion } catch { return 'unreadable' }
}
function Get-RepoStatus([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) { return 'folder not found' }
    $v = Get-InstalledVersion $path
    if (-not $v) { return 'not installed' }
    if ($v -eq $PackageVersion) { return "$v, up to date" }
    return "$v, update to $PackageVersion available"
}
# The engine's own -RepoPath mode: no prompts, no policy override. The window runs the same block in a background runspace.
$EngineCode = {
    param([string]$engine, [string]$path, [string[]]$extra)
    $a = @('-NoProfile', '-NonInteractive', '-File', $engine, '-RepoPath', $path) + $extra
    $ErrorActionPreference = 'Continue'   # Windows PowerShell 5.1: redirected native stderr must not abort
    $out = & powershell.exe @a 2>&1 | ForEach-Object { "$_" }
    [pscustomobject]@{ code = $LASTEXITCODE; text = ($out -join [Environment]::NewLine) }
}
function Invoke-Engine([string]$path, [string[]]$extra) { return (& $EngineCode $Engine $path $extra) }
# Settings are asked only for a first install; an upgrade keeps the repository's config.json.
function Get-SettingArgs([string]$path, [string]$ide, [string]$role) {
    if (Test-Path -LiteralPath (Join-Path $path 'playbook\pbi-builder\config.json')) { return @() }
    return @('-Ide', $ide, '-Role', $role)
}
$OutcomeText = @{ conflict = 'Nothing was written: files you edited differ from the installed record. Restore or move them, then try again.'; current = 'Already up to date. Nothing to write.' }
function Get-PreviewOutcome($p) {
    if ($p.code -ne 0) { return 'failed' }
    if ($p.text -match '(?m)^conflict\s') { return 'conflict' }
    if ($p.text -notmatch '(?m)^(create|update|retire)\s') { return 'current' }
    return 'changes'
}
# Preview, then ask, then apply with backups. Returns the log text and whether anything failed.
function Invoke-InstallFlow([string]$path, [string]$ide, [string]$role, [scriptblock]$confirm, [string[]]$extra = @()) {
    $settings = @(Get-SettingArgs $path $ide $role) + $extra
    $p = Invoke-Engine $path ($settings + '-Preview')
    switch (Get-PreviewOutcome $p) {
        'failed' { return [pscustomobject]@{ ok = $false; text = $p.text } }
        'conflict' { return [pscustomobject]@{ ok = $false; text = $p.text + "`r`n" + $OutcomeText.conflict } }
        'current' { return [pscustomobject]@{ ok = $true; text = $p.text + "`r`n" + $OutcomeText.current } }
    }
    if (-not (& $confirm $p.text)) { return [pscustomobject]@{ ok = $true; text = $p.text + "`r`nCancelled. Nothing was changed." } }
    $r = Invoke-Engine $path ($settings + '-AllowUpdates')
    if ($r.code -eq 0) { Add-Repo $path }
    return [pscustomobject]@{ ok = ($r.code -eq 0); text = $r.text }
}
function Get-UpgradeTargets { return @(Get-Repos | Where-Object { $v = Get-InstalledVersion $_; $v -and $v -ne $PackageVersion }) }

# ---- Paths: stored relative to the installation when they share a drive; source repositories are only read, never written ----
function ConvertTo-RepoRelative([string]$base, [string]$path) {
    if ($path.TrimEnd('\') -ieq $base.TrimEnd('\')) { return '.' }
    if ($path -notmatch '[#%]') {   # Uri would read # and % as URL syntax
        try { $u = ([Uri]($base.TrimEnd('\') + '\')).MakeRelativeUri([Uri]$path); if (-not $u.IsAbsoluteUri) { return [Uri]::UnescapeDataString($u.ToString()).TrimEnd('/') } } catch { }
    }
    return $path   # another drive or share: keep the absolute path
}
function ConvertTo-Full([string]$p) { $f = [System.IO.Path]::GetFullPath($p); if ($f.Length -gt 3) { $f = $f.TrimEnd('\') }; return $f }
function Resolve-SourcePath([string]$repo, [string]$value) {
    $v = $value.Trim().Trim('"'); if (-not $v) { return $null }
    if ($v -eq '.') { return (ConvertTo-Full $repo) }
    $full = if ([System.IO.Path]::IsPathRooted($v)) { $v } else { Join-Path $repo ($v.Replace('/', '\')) }
    try { return (ConvertTo-Full $full) } catch { return $full }
}
# Read-only detection of solutions, projects, target frameworks, architecture markers, GraphQL schema files and an installed
# PBI Builder; build output and dependencies are skipped. The window runs this block's text in a background runspace too.
$DetectCode = {
    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    function Read-Head([string]$file) {
        $s = [System.IO.File]::OpenRead($file)
        try { $b = New-Object byte[] ([Math]::Min(65536, $s.Length)); [void]$s.Read($b, 0, $b.Length); return $Utf8.GetString($b) } finally { $s.Dispose() }
    }
    function Get-SourceSummary([string]$full) {
        $r = [ordered]@{ path = $full; readable = $false; solutions = 0; projects = 0; graphql = 0; frameworks = @(); architecture = @(); installed = $null; detail = '' }
        if (-not $full -or -not [System.IO.Directory]::Exists($full)) { $r.detail = 'folder not found'; return $r }
        $skip = @('.git', '.vs', '.github', 'bin', 'obj', 'node_modules', 'packages', 'dist', '.angular', 'coverage', 'testresults', 'artifacts', '.nuget', 'playbook')
        $fw = New-Object 'System.Collections.Generic.SortedSet[string]'; $arch = New-Object 'System.Collections.Generic.SortedSet[string]'
        $stack = New-Object 'System.Collections.Generic.Stack[object]'; $stack.Push(@($full, 0)); $seen = 0
        try {
            while ($stack.Count -and $seen -lt 20000) {
                $item = $stack.Pop(); $dir = [string]$item[0]; $depth = [int]$item[1]
                foreach ($f in [System.IO.Directory]::EnumerateFiles($dir)) {
                    $seen++; $name = [System.IO.Path]::GetFileName($f); $ext = [System.IO.Path]::GetExtension($f).ToLowerInvariant()
                    if ($ext -eq '.sln') { $r.solutions++ }
                    elseif ($ext -eq '.csproj' -or $ext -eq '.vbproj') {
                        $r.projects++; $t = Read-Head $f
                        foreach ($m in [regex]::Matches($t, '<TargetFrameworks?>([^<]+)</TargetFrameworks?>|<TargetFrameworkVersion>([^<]+)</TargetFrameworkVersion>')) { foreach ($v in (($m.Groups[1].Value + $m.Groups[2].Value) -split ';')) { if ($v.Trim()) { [void]$fw.Add($v.Trim()) } } }
                        if ($t -match 'Microsoft\.Xrm\.Sdk|Microsoft\.CrmSdk') { [void]$arch.Add('Dynamics CRM/XRM') }
                        if ($t -match 'HotChocolate|GraphQL') { [void]$arch.Add('GraphQL') }
                        if ($t -match 'Microsoft\.NET\.Sdk\.Functions|Microsoft\.Azure\.Functions') { [void]$arch.Add('Azure Functions') }
                        if ($t -match 'MediatR') { [void]$arch.Add('CQRS (MediatR)') }
                        if ($t -match 'Microsoft\.NET\.Sdk\.Web|Microsoft\.AspNetCore') { [void]$arch.Add('ASP.NET') }
                    }
                    elseif ($name -eq 'angular.json') { [void]$arch.Add('Angular') }
                    elseif ($ext -eq '.graphql' -or $ext -eq '.gql') { $r.graphql++; [void]$arch.Add('GraphQL') }
                }
                if ($depth -lt 8) { foreach ($d in [System.IO.Directory]::EnumerateDirectories($dir)) { if ($skip -notcontains ([System.IO.Path]::GetFileName($d)).ToLowerInvariant()) { $stack.Push(@($d, $depth + 1)) } } }
            }
            $r.readable = $true
        }
        catch { $r.detail = 'not readable: ' + $_.Exception.Message; return $r }
        $r.frameworks = @($fw); $r.architecture = @($arch)
        $m = [System.IO.Path]::Combine($full, 'playbook\pbi-builder\installed-files.json')
        if ([System.IO.File]::Exists($m)) { try { $r.installed = [string]([System.IO.File]::ReadAllText($m, $Utf8) | ConvertFrom-Json).packageVersion } catch { $r.installed = 'unreadable' } }
        $r.detail = "readable; $($r.solutions) solution(s), $($r.projects) project(s)" + $(if ($fw.Count) { '; ' + (@($fw) -join ', ') } else { '' }) + $(if ($arch.Count) { '; ' + (@($arch) -join ', ') } else { '' }) + $(if ($seen -ge 20000) { ' (first 20000 files)' } else { '' })
        return $r
    }
}
. $DetectCode
$DetectScript = "param([string[]]`$paths)`n" + $DetectCode.ToString() + "`nforeach (`$p in `$paths) { Get-SourceSummary `$p }"

# ---- Windows folder picker: the Explorer-style IFileDialog in folder mode (address bar, navigation pane, network, New folder) ----
$FolderPickerSource = @'
using System;
using System.Runtime.InteropServices;
namespace AkzoPbiSetup {
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogCoClass { }
    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint count, IntPtr specs);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetFolder(out IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, int place);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string ext);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem {
        void BindToHandler(IntPtr bc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint sigdn, out IntPtr name);
        void GetAttributes(uint mask, out uint attributes);
        void Compare(IShellItem other, uint hint, out int order);
    }
    public static class FolderPicker {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        static extern void SHCreateItemFromParsingName(string path, IntPtr bc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem item);
        // Returns the chosen folder's full file-system path, or null when cancelled. Windows remembers the last folder per client GUID.
        public static string Pick(IntPtr owner, string title, string folder) {
            IFileDialog d = (IFileDialog)new FileOpenDialogCoClass();
            try {
                uint o; d.GetOptions(out o);
                d.SetOptions(o | 0x8 | 0x20 | 0x40 | 0x800);   // NOCHANGEDIR, PICKFOLDERS, FORCEFILESYSTEM, PATHMUSTEXIST
                Guid client = new Guid("6f0a4a5e-2b7c-4f61-9d1e-3c5b8a7d2e41"); d.SetClientGuid(ref client);
                if (!string.IsNullOrEmpty(title)) d.SetTitle(title);
                if (!string.IsNullOrEmpty(folder) && System.IO.Directory.Exists(folder)) {
                    IShellItem start; SHCreateItemFromParsingName(folder, IntPtr.Zero, typeof(IShellItem).GUID, out start); d.SetFolder(start);
                }
                int hr = d.Show(owner);
                if (hr == unchecked((int)0x800704C7)) return null;
                if (hr != 0) Marshal.ThrowExceptionForHR(hr);
                IShellItem result; d.GetResult(out result);
                IntPtr p; result.GetDisplayName(0x80058000, out p);
                try { return Marshal.PtrToStringUni(p); } finally { Marshal.FreeCoTaskMem(p); }
            } finally { Marshal.ReleaseComObject(d); }
        }
    }
}
'@
function Select-Folder([string]$title, [string]$current) {
    # Opens at the field's folder; an empty field opens next to the last folder chosen, else next to the install location
    # (repositories are usually its siblings), else where Windows remembers.
    $loc = Get-LocationFull
    $start = if ($current -and [System.IO.Directory]::Exists($current)) { $current } elseif ($script:LastPick) { Split-Path -Parent $script:LastPick } elseif ($loc -and [System.IO.Directory]::Exists($loc)) { Split-Path -Parent $loc } else { '' }
    try {
        if (-not ('AkzoPbiSetup.FolderPicker' -as [type])) { Add-Type -TypeDefinition $FolderPickerSource -Language CSharp }
        $p = [AkzoPbiSetup.FolderPicker]::Pick($script:ui.form.Handle, $title, $start)
    }
    catch { [void][System.Windows.Forms.MessageBox]::Show($script:ui.form, "The Windows folder picker could not be opened: $($_.Exception.Message)`n`nType or paste the full path in the box instead.", 'Browse', 'OK', 'Warning'); return $null }
    if ($p) { $script:LastPick = $p }
    return $p
}

# ---- The setup window: one window, no configuration pop-ups. Long steps run in background runspaces, polled by a timer. ----
$script:ui = @{}; $script:Rows = @(); $script:Jobs = New-Object System.Collections.ArrayList
$script:DetectCache = @{}; $script:Detecting = @{}; $script:Pending = @(); $script:Busy = $false; $script:Sync = $false
$script:Loaded = $null; $script:Baseline = $null; $script:LastPick = $null; $script:Filling = $false
$SourceRows = [ordered]@{ cdms = 'CDMS BL'; dab = 'DAB BL'; ui = 'Shared Angular UI'; schema = 'GraphQL Schema' }

function New-Ctl([string]$type, [hashtable]$p) { return (New-Object "System.Windows.Forms.$type" -Property $p) }
function Set-Status($label, [string]$state, [string]$text, [string]$tip) {
    $label.Text = $text; $label.ForeColor = $script:Colors[$state]
    $script:ui.tips.SetToolTip($label, $(if ($tip) { $tip } else { $text }))
}
function Get-Row([string]$key) { return @($script:Rows | Where-Object { $_.key -eq $key })[0] }
function New-PathRow($parent, [int]$top, [string]$key, [string]$label, [string]$id) {
    $t = New-Ctl Label @{ Left = 10; Top = $top + 4; Width = 136; Text = $label; AutoEllipsis = $true; Name = "${id}Label" }
    $b = New-Ctl TextBox @{ Left = 150; Top = $top; Width = 420; Name = "${id}Box"; AccessibleName = "$label path" }
    $br = New-Ctl Button @{ Left = 576; Top = $top - 1; Width = 80; Height = 25; Text = 'Browse...'; Name = "${id}Browse"; AccessibleName = "Browse for the $label folder" }
    $s = New-Ctl Label @{ Left = 662; Top = $top + 4; Width = 230; AutoEllipsis = $true; Name = "${id}Status" }
    $parent.Controls.AddRange(@($t, $b, $br, $s))
    $row = [pscustomobject]@{ key = $key; label = $label; name = ''; title = $t; box = $b; browse = $br; status = $s; stored = ''; storedFull = ''; full = ''; state = 'none'; blocking = $false; message = '' }
    $b.Tag = $row; $br.Tag = $row
    $br.Add_Click({ $r = $this.Tag; $p = Select-Folder "Select the $($r.label) folder" $r.full; if ($p) { $r.box.Text = $p; Update-Validation } })
    $b.Add_Leave({ Update-Validation })
    $b.Add_KeyDown({ if ($_.KeyCode -eq 'Return') { $_.SuppressKeyPress = $true; Update-Validation } })
    Set-Status $s 'info' 'Not configured (optional)' ''
    return $row
}
function Add-CustomRow([string]$name) {
    $i = @($script:Rows | Where-Object { $_.key -ne 'legacy' }).Count
    $panel = $script:ui.refPanel
    $row = New-PathRow $panel (4 + $i * 30 + $panel.AutoScrollPosition.Y) 'custom' $(if ($name) { $name } else { 'Custom reference' }) "Custom$i"
    $row.name = $name; $script:Rows += $row
    if ($panel.Width -gt 100) { Set-RowLayout $row $panel.ClientSize.Width }
    return $row
}
function Clear-CustomRows {
    foreach ($r in @($script:Rows | Where-Object { $_.key -eq 'custom' })) { foreach ($c in @($r.title, $r.box, $r.browse, $r.status)) { $script:ui.refPanel.Controls.Remove($c); $c.Dispose() } }
    $script:Rows = @($script:Rows | Where-Object { $_.key -ne 'custom' })
}
function Set-RowState($row, [string]$state, [string]$text, [string]$tip, [switch]$Blocking) {
    $row.state = $state; $row.blocking = [bool]$Blocking; $row.message = $text; Set-Status $row.status $state $text $tip
}
function Get-LocationFull {
    $t = $script:ui.location.Text.Trim().Trim('"')
    if (-not $t -or -not [System.IO.Path]::IsPathRooted($t)) { return '' }
    try { return (ConvertTo-Full $t) } catch { return '' }
}
function Show-RowSummary($row, $s, [string]$loc) {
    $here = if ($loc -and $row.full -ieq $loc) { ' (the install location)' } else { '' }
    $tip = "$($row.full)`n$($s.detail)" + $(if ($s.installed) { "`nPBI Builder $($s.installed) is installed there." } else { '' })
    if (-not $s.readable) {
        if ($s.detail -eq 'folder not found') { Set-RowState $row 'error' 'Error: folder not found' "$tip`nCheck the path, or use Browse." } else { Set-RowState $row 'error' 'Error: cannot read the folder' "$tip`nCheck that this account can open the folder." }
        return
    }
    $warn = switch ($row.key) {
        'schema' { if (-not $s.graphql) { 'Warning: no .graphql file found' } }
        'ui' { if ($s.architecture -notcontains 'Angular') { 'Warning: no angular.json found' } }
        'custom' { $null }
        default { if (-not ($s.solutions + $s.projects)) { 'Warning: no solution or project found' } }
    }
    if ($warn) { Set-RowState $row 'warning' ($warn + $here) "$tip`nCheck that this is the folder you meant (the repository root, the schema folder or the Angular workspace)."; return }
    $what = if ($row.key -eq 'schema') { "$($s.graphql) .graphql file(s)" } elseif ($row.key -eq 'ui') { 'Angular workspace' } elseif ($row.key -eq 'custom') { 'readable' } else { "$($s.solutions) solution(s), $($s.projects) project(s)" }
    Set-RowState $row 'ok' ("OK: $what" + $(if ($s.installed) { "; Builder $($s.installed)" } else { '' }) + $here) $tip
}
# Checks every path beside its field: characters, full path, duplicates now; folder contents from the detection cache.
function Update-RowState {
    $loc = Get-LocationFull; $seen = @{}; $script:Pending = @()
    foreach ($row in $script:Rows) {
        $row.full = ''; $v = $row.box.Text.Trim().Trim('"')
        if (-not $v) { Set-RowState $row 'info' $(if ($row.key -eq 'legacy') { 'Not configured' } else { 'Not configured (optional)' }) ''; continue }
        if ($v -match '[<>"|?*]') { Set-RowState $row 'error' 'Error: remove < > " | ? * from the path' 'Windows paths cannot contain these characters.' -Blocking; continue }
        if (($row.key -eq 'schema' -or $row.key -eq 'custom') -and $v.Contains(';')) { Set-RowState $row 'error' 'Error: remove ; from the path' 'Extra reference paths are saved as a ;-separated list.' -Blocking; continue }
        if (-not [System.IO.Path]::IsPathRooted($v) -and -not $loc) { Set-RowState $row 'error' 'Error: type the full path' 'For example C:\src\Repo, or choose the install location first.' -Blocking; continue }
        try { $full = Resolve-SourcePath $loc $v; [void][System.IO.Path]::GetFullPath($full) } catch { Set-RowState $row 'error' 'Error: not a valid Windows path' '' -Blocking; continue }
        $k = $full.ToLowerInvariant()
        if ($seen.ContainsKey($k)) { Set-RowState $row 'error' "Error: same folder as $($seen[$k])" "$full`nEach repository needs its own folder." -Blocking; continue }
        $seen[$k] = $row.label; $row.full = $full
        if ($script:DetectCache.ContainsKey($k)) { Show-RowSummary $row $script:DetectCache[$k] $loc } else { Set-RowState $row 'checking' 'Checking...' $full; $script:Pending += $full }
    }
    # Keep one empty custom row for another reference (the installer accepts at most 10 extra references).
    $extra = @($script:Rows | Where-Object { $_.key -eq 'custom' -or ($_.key -eq 'schema' -and $_.box.Text.Trim()) })
    if (-not @($extra | Where-Object { $_.key -eq 'custom' -and -not $_.box.Text.Trim() }).Count -and $extra.Count -lt 10 -and $script:ui.refPanel) { [void](Add-CustomRow '') }
}
function Update-Validation([switch]$Fresh) {
    if ($Fresh) { $script:DetectCache = @{} }
    Update-RowState
    $todo = @($script:Pending | Where-Object { -not $script:Detecting.ContainsKey($_.ToLowerInvariant()) })
    if (-not $todo.Count) { return }
    foreach ($p in $todo) { $script:Detecting[$p.ToLowerInvariant()] = $true }
    Start-Background $DetectScript @{ paths = [string[]]$todo } {
        param($o, $paths)
        foreach ($s in @($o)) { if ($s) { $script:DetectCache[([string]$s.path).ToLowerInvariant()] = $s } }
        foreach ($p in $paths) { $k = $p.ToLowerInvariant(); [void]$script:Detecting.Remove($k); if (-not $script:DetectCache.ContainsKey($k)) { $script:DetectCache[$k] = @{ path = $p; readable = $false; detail = 'not checked' } } }
        Update-RowState
    } $todo
}
function Start-Background([string]$code, [hashtable]$params, [scriptblock]$done, $state) {
    $ps = [powershell]::Create(); [void]$ps.AddScript($code); foreach ($k in $params.Keys) { [void]$ps.AddParameter($k, $params[$k]) }
    if ($script:Sync) { try { $out = $ps.Invoke() } finally { $ps.Dispose() }; & $done $out $state; return }
    [void]$script:Jobs.Add([pscustomobject]@{ ps = $ps; handle = $ps.BeginInvoke(); done = $done; state = $state })
    $script:ui.timer.Start()
}
function Complete-Jobs {
    foreach ($j in @($script:Jobs)) {
        if (-not $j.handle.IsCompleted) { continue }
        [void]$script:Jobs.Remove($j); $out = @()
        try { $out = @($j.ps.EndInvoke($j.handle)); if (-not $out.Count -and $j.ps.Streams.Error.Count) { $out = @([pscustomobject]@{ code = 1; text = 'The step did not run: ' + (@($j.ps.Streams.Error) -join '; ') }) } }
        catch { $out = @([pscustomobject]@{ code = 1; text = 'The step did not run: ' + $_.Exception.Message }) }
        finally { $j.ps.Dispose() }
        & $j.done $out $j.state
    }
    if (-not $script:Jobs.Count) { $script:ui.timer.Stop() }
}
function Write-Log([string]$text) { $script:ui.log.AppendText("[$((Get-Date).ToString('HH:mm:ss'))] $text`r`n`r`n") }
function Set-Busy([string]$text) {
    $script:Busy = $true; foreach ($c in $script:ui.lock) { $c.Enabled = $false }
    $script:ui.progress.Visible = $true; $script:ui.progressText.Text = $text; $script:ui.form.Cursor = 'AppStarting'
}
function Set-Idle([string]$text) {
    $script:Busy = $false; foreach ($c in $script:ui.lock) { $c.Enabled = $true }
    $script:ui.progress.Visible = $false; $script:ui.progressText.Text = $text; $script:ui.form.Cursor = 'Default'; Update-UpgradeButton
}
function Start-Step([string]$text, [string]$path, [string[]]$extra, [scriptblock]$done, $state) {
    Set-Busy $text; Write-Log $text
    Start-Background $EngineCode.ToString() @{ engine = $Engine; path = $path; extra = [string[]]$extra } $done $state
}
function Show-Message([string]$text, [string]$title, [string]$buttons = 'OK', [string]$icon = 'Information') {
    if ($script:Sync) { return 'Yes' }
    return [string][System.Windows.Forms.MessageBox]::Show($script:ui.form, $text, $title, $buttons, $icon)
}

# The installer arguments for what the window shows. The four sources map to -LegacySource ... -UiSource (a single space clears
# a saved path); the schema and custom rows to -OtherSource Name=path entries. This repository's role is the source row whose
# folder is the install location (none: other). Unchanged values are sent exactly as saved.
function Get-PathArgument($row, [string]$loc) {
    if (-not $row.full) { return $row.box.Text.Trim().Trim('"') }
    if ($row.stored -and $loc -ieq $script:Loaded -and $row.full -ieq $row.storedFull) { return $row.stored }
    return (ConvertTo-RepoRelative $loc $row.full)
}
function Get-UniqueName([string]$base, [hashtable]$used) {
    $b = ($base -replace '[=;]', '-').Trim(); if (-not $b) { $b = 'Custom reference' }; if ($b.Length -gt 50) { $b = $b.Substring(0, 50) }
    $n = $b; if ($used.ContainsKey($n.ToLowerInvariant())) { $n = "$b reference" }
    for ($i = 2; $used.ContainsKey($n.ToLowerInvariant()); $i++) { $n = "$b $i" }
    return $n
}
function Get-WindowSettings([string]$At) {
    Update-RowState
    $errors = @(); $warnings = @()
    $text = $script:ui.location.Text.Trim().Trim('"'); $loc = if ($PSBoundParameters.ContainsKey('At')) { $At } else { Get-LocationFull }
    if (-not $text) { $errors += 'Install location: choose the repository to install into.' }
    elseif (-not $loc) { $errors += 'Install location: type the full path, for example C:\src\MyRepo.' }
    elseif (-not [System.IO.Directory]::Exists($loc)) { $errors += 'Install location: folder not found.' }
    elseif (-not (Test-Path -LiteralPath (Join-Path $loc '.git'))) { $warnings += 'Install location: no .git folder; the PBI Builder belongs in the repository root.' }
    foreach ($row in $script:Rows) { if ($row.state -eq 'error') { $m = "$($row.label): $($row.message -replace '^Error: ', '')"; if ($row.blocking) { $errors += $m } else { $warnings += $m } } }
    $role = 'other'
    foreach ($k in 'legacy', 'cdms', 'dab', 'ui') { $r = Get-Row $k; if ($loc -and $r.full -and $r.full -ieq $loc) { $role = $k; break } }
    $ideValue = Get-EditorSelection
    if (-not $ideValue) { $errors += 'Editor: select at least one editor.' }
    $a = @($(if ($ideValue) { @('-Ide', $ideValue) }) + @('-Role', $role))
    foreach ($k in 'legacy', 'cdms', 'dab', 'ui') {
        if ($k -eq $role) { continue }
        $v = Get-PathArgument (Get-Row $k) $loc
        $a += @("-$((Get-Culture).TextInfo.ToTitleCase($k))Source", $(if ($v) { $v } else { ' ' }))
    }
    $extraRows = @($script:Rows | Where-Object { $_.key -eq 'schema' -or $_.key -eq 'custom' })
    $used = @{ legacy = 1; dab = 1; cdms = 1; ui = 1; 'graphql schema' = 1 }
    foreach ($row in $extraRows) { if ($row.name) { $used[$row.name.ToLowerInvariant()] = 1 } }
    $others = @()
    foreach ($row in $extraRows) {
        $v = Get-PathArgument $row $loc; if (-not $v) { continue }
        $n = if ($row.name) { $row.name } elseif ($row.key -eq 'schema') { 'GraphQL Schema' } else { Get-UniqueName ([System.IO.Path]::GetFileName($row.full)) $used }
        $used[$n.ToLowerInvariant()] = 1; $others += "$n=$v"
    }
    $a += @('-OtherSource', $(if ($others.Count) { $others -join ';' } else { ';' }))
    return [pscustomobject]@{ location = $loc; role = $role; ide = $ideValue; args = $a; errors = $errors; warnings = $warnings }
}
function Test-Unsaved {
    $typed = @($script:Rows | Where-Object { $_.box.Text.Trim() }).Count
    if ($null -eq $script:Baseline) { return [bool]$typed }
    return ((Get-WindowSettings -At $script:Loaded).args -join '|') -ne $script:Baseline
}
function Confirm-Discard { return (Show-Message "The paths shown for $(if ($script:Loaded) { $script:Loaded } else { 'the new installation' }) are not saved.`n`nDiscard them? (Install / Upgrade saves them.)" 'Setup' 'YesNo' 'Question') -eq 'Yes' }

function Get-EditorSelection { $v = $script:ui.vs.Checked; $c = $script:ui.vscode.Checked; if ($v -and $c) { return 'both' }; if ($c) { return 'vscode' }; if ($v) { return 'visualstudio' }; return '' }
function Set-EditorSelection([string]$ide) { $script:Filling = $true; $script:ui.vs.Checked = ($ide -ne 'vscode'); $script:ui.vscode.Checked = ($ide -eq 'vscode' -or $ide -eq 'both'); $script:Filling = $false; Show-EditorStatus }
# One status per editor for the install location: its agent file against the installation record, and what Install / Upgrade will do.
function Show-EditorStatus {
    $loc = Get-LocationFull; $sel = Get-EditorSelection; $lbl = $script:ui.editorStatus
    if (-not $sel) { Set-Status $lbl 'error' 'Error: select at least one editor.' ''; return }
    $m = $null; $cfg = $null
    if ($loc) { try { $m = [System.IO.File]::ReadAllText((Join-Path $loc 'playbook\pbi-builder\installed-files.json'), $Utf8) | ConvertFrom-Json; $cfg = [System.IO.File]::ReadAllText((Join-Path $loc 'playbook\pbi-builder\config.json'), $Utf8) | ConvertFrom-Json } catch { } }
    $have = if ($m -and $cfg) { Get-EditorAgents ([string]$cfg.ide) } else { [ordered]@{} }; $want = Get-EditorAgents $sel; $state = 'ok'; $parts = @()
    foreach ($k in $EditorLabels.Keys) {
        $t = if ($have.Contains($k)) {
            $p = Join-Path $loc ($have[$k].Replace('/', '\')); $rec = [string]($m.files.PSObject.Properties | Where-Object { $_.Name -ceq $have[$k] } | ForEach-Object { $_.Value })
            if (-not [System.IO.File]::Exists($p)) { $state = 'warning'; 'agent file missing (Repair restores it)' }
            elseif (-not $rec -or ((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -ne $rec)) { $state = 'warning'; 'agent file edited (never overwritten)' }
            elseif ($m.packageVersion -ne $PackageVersion) { $state = 'warning'; "installed ($($m.packageVersion)), update available" }
            else { 'installed, up to date' }
        } elseif ($want.Contains($k)) { 'not installed; Install / Upgrade adds it' } else { 'not installed' }
        if ($have.Contains($k) -and -not $want.Contains($k)) { $t += '; unticked: Install / Upgrade removes its agent' }
        $parts += "$($EditorLabels[$k]): $t."
    }
    Set-Status $lbl $state ($parts -join ' ') ''
}
function Show-LocationStatus([string]$note) {
    Show-EditorStatus
    $text = $script:ui.location.Text.Trim(); $loc = Get-LocationFull; $lbl = $script:ui.locationStatus
    if (-not $text) { Set-Status $lbl 'info' 'Type or paste the repository to install into, Browse to it, or click a remembered installation above.' ''; return }
    if (-not $loc) { Set-Status $lbl 'error' 'Error: type the full path, for example C:\src\MyRepo.' ''; return }
    if (-not [System.IO.Directory]::Exists($loc)) { Set-Status $lbl 'error' 'Error: folder not found. Type an existing folder or use Browse.' $loc; return }
    $v = Get-InstalledVersion $loc
    $state = if (-not $v -or $v -eq $PackageVersion) { 'ok' } else { 'warning' }
    $msg = if (-not $v) { "Not installed. Install / Upgrade installs $PackageVersion here with the settings below." } elseif ($v -eq $PackageVersion) { "Installed: $v, up to date. Install / Upgrade saves changed settings." } else { "Installed: $v. Install / Upgrade updates it to $PackageVersion and keeps its settings." }
    if (-not (Test-Path -LiteralPath (Join-Path $loc '.git'))) { $state = 'warning'; $msg += ' Warning: no .git folder; use the repository root.' }
    if ($note) { $state = 'warning'; $msg += " $note" }
    Set-Status $lbl $state $msg $loc
}
function Set-RowStored($row, [string]$base, [string]$value) {
    $row.stored = $value; $row.storedFull = ''
    if ($value) { try { $row.storedFull = Resolve-SourcePath $base $value } catch { } }
    $row.box.Text = $(if ($row.storedFull) { $row.storedFull } else { $value })
}
# Shows an installation: its saved editor and paths, or, for a folder without the PBI Builder, keeps what is typed for the new installation.
function Open-Installation([string]$path, [switch]$Reload) {
    $t = $path.Trim().Trim('"'); $full = ''
    if ($t -and [System.IO.Path]::IsPathRooted($t)) { try { $full = ConvertTo-Full $t } catch { } }
    if (-not $Reload -and $full -and $script:Loaded -and $full -ieq $script:Loaded) { $script:ui.location.Text = $full; Show-LocationStatus; return }
    $cfgFile = if ($full) { Join-Path $full 'playbook\pbi-builder\config.json' } else { '' }
    $cfg = $null; $note = ''
    if ($cfgFile -and (Test-Path -LiteralPath $cfgFile)) { try { $cfg = [System.IO.File]::ReadAllText($cfgFile, $Utf8) | ConvertFrom-Json } catch { $note = 'Its config.json is not valid JSON; Install / Upgrade reports the problem.' } }
    # Only an installed location replaces the fields, so only then can unsaved paths be lost.
    if ($cfg -and -not $Reload -and $script:Loaded -and (Test-Unsaved) -and -not (Confirm-Discard)) { $script:ui.location.Text = $script:Loaded; Select-Installation; return }
    if ($full) { $script:ui.location.Text = $full }
    if ($cfg) {
        Clear-CustomRows; $script:ui.refPanel.AutoScrollPosition = New-Object System.Drawing.Point(0, 0)
        Set-EditorSelection ([string]$cfg.ide)
        foreach ($k in 'legacy', 'cdms', 'dab', 'ui') { Set-RowStored (Get-Row $k) $full ([string]$cfg.sources.$k) }
        $schema = Get-Row 'schema'; $schema.name = ''; Set-RowStored $schema $full ''
        foreach ($o in @($cfg.others | Where-Object { $_ })) {
            if (-not $schema.name -and [string]$o.name -ieq 'GraphQL Schema') { $schema.name = [string]$o.name; Set-RowStored $schema $full ([string]$o.path) }
            else { $r = Add-CustomRow ([string]$o.name); Set-RowStored $r $full ([string]$o.path) }
        }
    }
    else { foreach ($row in $script:Rows) { $row.stored = ''; $row.storedFull = '' } }
    $script:Loaded = $(if ($full) { $full } else { $null })
    $script:Baseline = if ($cfg) { (Get-WindowSettings).args -join '|' } else { $null }
    Show-LocationStatus $note; Select-Installation
    if ($cfg -and -not $script:Sync) { try { [System.IO.File]::WriteAllText($LastFile, $full, $Utf8) } catch { } }
    Update-Validation
}
function Select-Installation {
    foreach ($it in $script:ui.list.Items) { $it.Selected = ($script:Loaded -and $it.Tag.path -ieq $script:Loaded) }
}
function Update-UpgradeButton {
    $n = @($script:ui.list.CheckedItems).Count
    $script:ui.upgrade.Text = "Upgrade ticked ($n)"; $script:ui.upgrade.Enabled = ($n -gt 0 -and -not $script:Busy)
}
# Text hash exactly as Install-PBIBuilder.ps1 records it (SHA-256 of the UTF-8 text).
function Get-TextSha([string]$file) { $t = [System.IO.File]::ReadAllText($file, $Utf8); return [BitConverter]::ToString($script:Sha.ComputeHash($Utf8.GetBytes($t))).Replace('-', '').ToLowerInvariant() }
# What the list shows for one installation. "Installed" only when every recorded file is present (checked by its hash);
# "Failed" when this window's last Install, Upgrade or Repair there did not finish.
function Get-InstallState([string]$p) {
    $s = [ordered]@{ version = '-'; editors = '-'; status = ''; required = ''; detail = ''; outdated = $false; color = 'info' }
    if (-not (Test-Path -LiteralPath $p -PathType Container)) { $s.status = 'Not Found'; $s.required = 'Fix path'; $s.color = 'error'; $s.detail = 'The folder is not reachable. Reconnect the drive or share, or remove it from the list.'; return $s }
    $mf = Join-Path $p 'playbook\pbi-builder\installed-files.json'
    if (-not (Test-Path -LiteralPath $mf)) { $s.status = 'Not Installed'; $s.required = 'Install'; $s.detail = 'No PBI Builder installation record in this folder.'; return $s }
    try { $m = [System.IO.File]::ReadAllText($mf, $Utf8) | ConvertFrom-Json } catch { $s.status = 'Failed'; $s.required = 'Repair'; $s.color = 'error'; $s.detail = 'The installation record cannot be read.'; return $s }
    $s.version = [string]$m.packageVersion; $s.outdated = ($s.version -ne $PackageVersion)
    try { $ide = [string]([System.IO.File]::ReadAllText((Join-Path $p 'playbook\pbi-builder\config.json'), $Utf8) | ConvertFrom-Json).ide; $s.editors = @((Get-EditorAgents $ide).Keys | ForEach-Object { $EditorLabels[$_] }) -join ' + ' } catch { $s.editors = '?' }
    $missing = @(); $edited = @(); $n = 0
    foreach ($f in $m.files.PSObject.Properties) {
        $n++; $full = Join-Path $p ($f.Name.Replace('/', '\'))
        if (-not [System.IO.File]::Exists($full)) { $missing += $f.Name } elseif ((Get-TextSha $full) -ne [string]$f.Value) { $edited += $f.Name }
    }
    $kept = if ($edited.Count) { " $($edited.Count) edited file(s) kept: $(@($edited | Select-Object -First 3) -join ', ')" } else { '' }
    $fail = $script:Outcome[$p.ToLowerInvariant()]
    if ($fail) { $s.status = 'Failed'; $s.required = 'Retry'; $s.color = 'error'; $s.detail = $fail }
    elseif ($s.outdated) { $s.status = 'Upgrade Available'; $s.required = 'Upgrade'; $s.color = 'warning'; $s.detail = "$($s.version) installed; this package is $PackageVersion.$kept" }
    elseif ($missing.Count) { $s.status = 'Repair Needed'; $s.required = 'Repair'; $s.color = 'warning'; $s.detail = "$($missing.Count) of $n recorded files missing: $(@($missing | Select-Object -First 3) -join ', ')" }
    else { $s.status = 'Installed'; $s.required = 'None'; $s.color = 'ok'; $s.detail = "Verified: $($n - $edited.Count) of $n recorded files match.$kept" }
    return $s
}
function Set-Outcome([string]$p, [string]$text) { if ($text) { $script:Outcome[$p.ToLowerInvariant()] = $text } else { [void]$script:Outcome.Remove($p.ToLowerInvariant()) } }
function Update-Installations {
    $l = $script:ui.list; $script:Filling = $true; $l.BeginUpdate(); $l.Items.Clear()
    foreach ($p in @(Get-Repos)) {
        $s = Get-InstallState $p
        $it = New-Object System.Windows.Forms.ListViewItem($p); $it.UseItemStyleForSubItems = $false
        foreach ($v in @($s.version, $s.editors, $s.status, $s.required)) { [void]$it.SubItems.Add([string]$v) }
        $it.SubItems[3].ForeColor = $script:Colors[$s.color]
        $it.ToolTipText = "$p`n$($s.status): $($s.detail)"
        $it.Tag = [pscustomobject]@{ path = $p; outdated = [bool]($s.outdated -and $s.version -ne 'unreadable'); state = $s }
        $it.Checked = $it.Tag.outdated
        [void]$l.Items.Add($it)
    }
    $l.EndUpdate(); Select-Installation; $script:Filling = $false; Update-UpgradeButton; Update-ListColumns
}
# Location takes the width the other columns leave, or the longest path's width (the list then scrolls sideways).
# Location takes the width the other columns leave (at least 360), so version, editors and status stay in view; a longer path
# ends in ... with the full path in its tooltip. A column the user drags wider (the list then scrolls sideways) keeps that
# width until the window is resized.
function Update-ListColumns([switch]$Resized) {
    $l = $script:ui.list; if ($l.Columns.Count -lt 5) { return }
    if ($Resized) { $script:UserColumns = $false }
    if ($script:UserColumns) { return }
    $fixed = 0; foreach ($i in 1..4) { $fixed += $l.Columns[$i].Width }
    $script:SettingColumns = $true
    try { $l.Columns[0].Width = [Math]::Max(360, $l.ClientSize.Width - $fixed - 4) } finally { $script:SettingColumns = $false }
}

# ---- Results: a short summary of each step (counts from the installer's own plan and Verify output); the full log on request ----
$PlanPattern = '(?m)^(create|update|unchanged|conflict|retire|retire-conflict|kept)[ ]+(?!playbook/pbi-builder/installed-files\.json)\S'   # files, not the installation record
$VerifyPattern = '(?m)^(OK|MISSING|CHANGED)[ ]+\S'
function Get-Counts([string]$text, [string]$pattern) { $c = @{}; foreach ($m in [regex]::Matches($text, $pattern)) { $c[$m.Groups[1].Value] = 1 + [int]$c[$m.Groups[1].Value] }; return $c }
function Set-Summary([string]$text) { $script:ui.summary.Text = $text }
function Get-EditorLines([string]$text) {
    return @([regex]::Matches($text, '(?m)^Editor (.+?): (ready \((\w+)\): (\S+), agent (.+)|left as it is.*|BLOCKED: (\S+).*|NOT WRITTEN: .*)$') | ForEach-Object {
            $g = $_.Groups
            if ($g[3].Success) { "  $($g[1].Value): $($g[4].Value) ($($g[3].Value)), agent ""$($g[5].Value.TrimEnd())""" }
            elseif ($g[6].Success) { "  $($g[1].Value): BLOCKED - $($g[6].Value) was edited and is never overwritten" }
            elseif ($g[2].Value -like 'NOT WRITTEN*') { "  $($g[1].Value): not written (another editor is blocked)" }
            else { "  $($g[1].Value): left as it is (this step was limited to the other editor)" } })
}
function Get-VerifyLine($v) {
    $c = Get-Counts $v.text $VerifyPattern
    if ($v.code -eq 0) { return "Verified: all $([int]$c['OK']) recorded files match." }
    return "Verification: $([int]$c['OK']) match, $([int]$c['MISSING']) missing, $([int]$c['CHANGED']) changed (edited files are kept). Repair restores missing files."
}
function Format-InstallSummary([string]$path, $apply, $verify, [string]$result) {
    $c = Get-Counts $apply.text $PlanPattern; $n = { param($k) [int]$c[$k] }
    $kept = (& $n 'unchanged') + (& $n 'retire-conflict') + (& $n 'kept')
    $lines = @("Target repository: $path")
    if ($apply.code -ne 0 -or -not $verify) {
        $failed = if (& $n 'conflict') { & $n 'conflict' } else { (& $n 'create') + (& $n 'update') + (& $n 'retire') }
        $lines += "Result: $result"
        $lines += "Files: 0 installed, 0 updated, $kept preserved, 0 backed up, $failed failed."
    }
    else {
        $lines += "Result: $result $(Get-VerifyLine $verify)"
        $lines += "Files: $(& $n 'create') installed, $(& $n 'update') updated, $(& $n 'retire') retired, $kept preserved (unchanged or edited by you), $((& $n 'update') + (& $n 'retire')) backed up, 0 failed."
    }
    $eds = Get-EditorLines $apply.text
    if ($eds.Count) { $lines += 'Editor configurations:'; $lines += $eds }
    return ($lines -join "`r`n")
}
function Get-EditorDone([string]$text) { return @([regex]::Matches($text, '(?m)^Editor (.+?): (installed|not changed)') | ForEach-Object { "$($_.Groups[1].Value) $($_.Groups[2].Value)" }) }

function Start-Install {
    Show-LocationStatus; $s = Get-WindowSettings
    if ($s.errors.Count) {
        $script:ui.progressText.Text = 'Not started: ' + $s.errors[0]
        $bad = @($script:Rows | Where-Object { $_.state -eq 'error' -and $_.blocking })[0]
        if ($bad) { [void]$bad.box.Focus() } else { [void]$script:ui.location.Focus() }
        return
    }
    Set-Summary "Working on $($s.location)..."
    Start-Step "Step 1 of 3: previewing the changes for $($s.location)..." $s.location ($s.args + '-Preview') { param($o, $st) Complete-InstallPreview @($o)[0] $st } @{ path = $s.location; settings = $s.args; warnings = $s.warnings }
}
function Complete-InstallPreview($r, $st) {
    $outcome = Get-PreviewOutcome $r
    $blocked = @([regex]::Matches($r.text, '(?m)^Editor (.+?): BLOCKED: ') | ForEach-Object { $_.Groups[1].Value }); $free = @([regex]::Matches($r.text, '(?m)^Editor (.+?): NOT WRITTEN: ') | ForEach-Object { $_.Groups[1].Value })
    if ($outcome -eq 'conflict' -and $blocked.Count -eq 1 -and $free.Count -eq 1) {
        Write-Log $r.text; $key = @($EditorLabels.Keys | Where-Object { $EditorLabels[$_] -eq $free[0] })[0]
        if ((Show-Message "$($blocked[0]) cannot be updated: its agent file was edited, and edited files are never overwritten.`n`nInstall / upgrade $($free[0]) only? $($blocked[0]) stays as it is." 'Install / Upgrade' 'YesNo' 'Question') -ne 'Yes') {
            Set-Summary (Format-InstallSummary $st.path $r $null "NOT installed: $($blocked[0]) is blocked by its edited agent file; nothing was written."); Set-Idle "Nothing was written: $($blocked[0]) is blocked by its edited agent file. See the summary."; return
        }
        Start-Step "Step 2 of 3: installing $PackageVersion for $($free[0]) into $($st.path)..." $st.path ($st.settings + @('-Editor', $key, '-AllowUpdates')) { param($o, $s2) Complete-Install @($o)[0] $s2 } $st; return
    }
    if ($outcome -eq 'current') { Write-Log ($r.text + "`r`n" + $OutcomeText.current); $st.apply = $r; $st.result = "already up to date ($PackageVersion); nothing was written."; Start-Verify $st; return }
    if ($outcome -ne 'changes') {
        Write-Log ($r.text + "`r`n" + $(if ($outcome -eq 'failed') { '== Stopped: see above ==' } else { $OutcomeText[$outcome] }))
        $why = if ($outcome -eq 'conflict') { 'NOT installed: files you edited differ from the installed record and are never overwritten; nothing was written.' } else { "NOT installed: the preview stopped (exit code $($r.code)); nothing was written. Show log for the reason." }
        if ($outcome -eq 'failed') { Set-Outcome $st.path "The preview stopped (exit code $($r.code)); nothing was written." }
        Update-Installations; Set-Summary (Format-InstallSummary $st.path $r $null $why)
        Set-Idle $(if ($blocked.Count) { "Stopped: nothing was written. Blocked: $($blocked -join ', '). See the summary." } else { 'Stopped: nothing was written. See the summary.' }); return
    }
    $plan = (($r.text -split "`r?`n") | Where-Object { $_ -match '^(create|update|retire|Review:)' } | Select-Object -First 25) -join "`n"
    $warn = if (@($st.warnings).Count) { "`n`nNot verified (saved anyway; Verify shows the result):`n" + (@($st.warnings) -join "`n") } else { '' }
    if ((Show-Message "Planned changes in $($st.path):`n`n$plan$warn`n`nApply them? Files that are replaced are backed up first." 'Install / Upgrade' 'YesNo' 'Question') -ne 'Yes') { Write-Log ($r.text + "`r`nCancelled. Nothing was changed."); Set-Summary "Target repository: $($st.path)`r`nResult: cancelled. Nothing was changed."; Set-Idle 'Cancelled. Nothing was changed.'; return }
    Start-Step "Step 2 of 3: installing $PackageVersion into $($st.path)..." $st.path ($st.settings + '-AllowUpdates') { param($o, $s2) Complete-Install @($o)[0] $s2 } $st
}
function Complete-Install($r, $st) {
    Write-Log ($r.text + "`r`n== $(if ($r.code -eq 0) { 'Written; verifying' } else { 'Stopped: see above' }) ==")
    $st.apply = $r
    if ($r.code -ne 0) {
        Set-Outcome $st.path "Install / Upgrade stopped (exit code $($r.code)); nothing was written."
        Update-Installations; Open-Installation $st.path -Reload
        Set-Summary (Format-InstallSummary $st.path $r $null "FAILED (exit code $($r.code)). Nothing was written; anything already changed was rolled back. Show log for the reason.")
        Set-Idle 'Stopped: nothing was written. See the summary.'; return
    }
    Add-Repo $st.path; $st.result = "$PackageVersion installed."; Start-Verify $st
}
# Success is reported only after Verify has checked every recorded file.
function Start-Verify($st) { Start-Step "Step 3 of 3: verifying the installed files in $($st.path)..." $st.path @('-Action', 'Verify') { param($o, $s) Complete-InstallVerify @($o)[0] $s } $st }
function Complete-InstallVerify($v, $st) {
    Write-Log ($v.text + "`r`n== Verify $(if ($v.code -eq 0) { 'passed' } else { 'found missing or changed files' }) ==")
    Set-Outcome $st.path $(if ($v.code -ne 0 -and (Get-Counts $v.text $VerifyPattern)['MISSING']) { 'Installed, but Verify found missing files. Run Repair.' } else { '' })
    Update-Installations; Open-Installation $st.path -Reload
    Set-Summary (Format-InstallSummary $st.path $st.apply $v $st.result)
    Set-Idle "Done: $PackageVersion is installed in $($st.path)$(if (($e = Get-EditorDone $st.apply.text).Count) { ' (' + ($e -join '; ') + ')' }). $(Get-VerifyLine $v)"
}
function Start-UpgradeTicked {
    $targets = @($script:ui.list.CheckedItems | ForEach-Object { $_.Tag.path })
    if (-not $targets.Count) { return }
    if ((Show-Message "Upgrade $($targets.Count) installation(s) to $($PackageVersion)?`n`n$($targets -join "`n")`n`nEach keeps its settings and is previewed first; an installation with edited files is skipped and reported." 'Upgrade ticked' 'YesNo' 'Question') -ne 'Yes') { return }
    Set-Summary "Upgrading $($targets.Count) installation(s)..."
    Step-Upgrade @{ queue = [System.Collections.ArrayList]@($targets); total = $targets.Count; report = New-Object System.Collections.ArrayList; lines = New-Object System.Collections.ArrayList; current = ''; ok = 0 }
}
function Step-Upgrade($st) {
    if (-not $st.queue.Count) {
        Write-Log ($st.report -join "`r`n`r`n"); Update-Installations; Show-LocationStatus   # an upgrade keeps each config.json, so the fields stay as shown
        Set-Summary ((@("Upgrade ticked: $($st.ok) of $($st.total) upgraded and verified.") + @($st.lines)) -join "`r`n")
        Set-Idle "Upgrade finished: $($st.ok) of $($st.total) upgraded. See the log."; return
    }
    $st.current = $st.queue[0]; $st.queue.RemoveAt(0); $k = $st.total - $st.queue.Count
    Start-Step "Previewing $($st.current) ($k of $($st.total))..." $st.current @('-Preview') { param($o, $s) Complete-UpgradePreview @($o)[0] $s } $st
}
function Complete-UpgradePreview($r, $st) {
    $outcome = Get-PreviewOutcome $r
    if ($outcome -ne 'changes') {
        [void]$st.report.Add("== $($st.current) : $(if ($outcome -eq 'current') { 'already up to date' } else { 'NOT upgraded' })`r`n$($r.text)`r`n$($OutcomeText[$outcome])")
        [void]$st.lines.Add("  $($st.current): $(if ($outcome -eq 'current') { 'already up to date' } elseif ($outcome -eq 'conflict') { 'NOT upgraded - files you edited block it (Show log)' } else { 'NOT upgraded - the preview stopped (Show log)' })")
        if ($outcome -eq 'failed') { Set-Outcome $st.current 'The upgrade preview stopped; nothing was written.' }
        Step-Upgrade $st; return
    }
    Start-Step "Upgrading $($st.current)..." $st.current @('-AllowUpdates') {
        param($o, $s) $x = @($o)[0]
        [void]$s.report.Add("== $($s.current) : $(if ($x.code -eq 0) { 'upgraded' } else { 'NOT upgraded' })`r`n$($x.text)")
        if ($x.code -ne 0) { Set-Outcome $s.current "The upgrade stopped (exit code $($x.code)); nothing was written."; [void]$s.lines.Add("  $($s.current): FAILED - nothing was written (Show log)"); Step-Upgrade $s; return }
        $c = Get-Counts $x.text $PlanPattern; $s.counts = "$([int]$c['create']) installed, $([int]$c['update']) updated, $([int]$c['update'] + [int]$c['retire']) backed up"
        Start-Step "Verifying $($s.current)..." $s.current @('-Action', 'Verify') {
            param($o2, $s2) $v = @($o2)[0]; [void]$s2.report.Add("== $($s2.current) : verify`r`n$($v.text)")
            Set-Outcome $s2.current $(if ($v.code -ne 0 -and (Get-Counts $v.text $VerifyPattern)['MISSING']) { 'Upgraded, but Verify found missing files. Run Repair.' } else { '' })
            if ($v.code -eq 0) { $s2.ok++ }
            [void]$s2.lines.Add("  $($s2.current): upgraded to $PackageVersion ($($s2.counts)). $(Get-VerifyLine $v)"); Step-Upgrade $s2 } $s
    } $st
}
function Start-Simple([string]$action) {
    $loc = Get-LocationFull
    if (-not $loc -or -not (Get-InstalledVersion $loc)) { $script:ui.progressText.Text = "$($action): the PBI Builder is not installed in the install location. Install it first."; return }
    if ($action -eq 'Uninstall' -and (Show-Message "Remove the PBI Builder from`n$loc ?`n`nKept: playbook\pbis (your PBIs and decisions), knowledge notes, backups and any file you edited." 'Uninstall' 'YesNo' 'Warning') -ne 'Yes') { return }
    Set-Summary "Working on $loc..."
    $editors = @('visualstudio')
    if ($action -eq 'Repair') { try { $editors = @((Get-EditorAgents ([string]([System.IO.File]::ReadAllText((Join-Path $loc 'playbook\pbi-builder\config.json'), $Utf8) | ConvertFrom-Json).ide)).Keys) } catch { } }
    if ($action -eq 'Repair') { Step-Repair @{ path = $loc; queue = [System.Collections.ArrayList]@($editors); report = New-Object System.Collections.ArrayList; restored = 0; single = ($editors.Count -le 1) }; return }
    Start-Step "$action $loc..." $loc @('-Action', $action) { param($o, $st) Complete-Simple @($o)[0] $st } @{ path = $loc; action = $action }
}
# Repair runs once per editor (with one editor, once without -Editor), so one editor's problem does not stop the other; then Verify.
function Step-Repair($st) {
    if (-not $st.queue.Count) {
        Start-Step "Verifying $($st.path)..." $st.path @('-Action', 'Verify') {
            param($o, $s) $v = @($o)[0]; Write-Log ($v.text + "`r`n== Verify $(if ($v.code -eq 0) { 'passed' } else { 'found missing or changed files' }) ==")
            Set-Outcome $s.path $(if (@($s.report | Where-Object { $_ -like '*NOT repaired' }).Count) { "Repair stopped: $(@($s.report | Where-Object { $_ -like '*NOT repaired' }) -join '; ') (Show log)." } else { '' })
            Update-Installations; Show-LocationStatus
            Set-Summary ((@("Target repository: $($s.path)", "Result: $(if ($s.single) { if ($s.report[0] -like '*NOT repaired') { 'NOT repaired (Show log for the reason)' } else { 'repaired' } } else { $s.report -join '; ' }). $(Get-VerifyLine $v)", "Files: $($s.restored) restored or updated, 0 overwritten (edited files are never overwritten).")) -join "`r`n")
            Set-Idle $(if ($s.single) { "Repair $(if ($s.report[0] -like '*NOT repaired') { 'stopped' } else { 'finished' }). See the log." } else { "Repair: $($s.report -join '; '). See the log." }) } $st
        return
    }
    $k = $st.queue[0]; $st.queue.RemoveAt(0); $st.current = $k
    $extra = if ($st.single) { @('-Action', 'Repair') } else { @('-Action', 'Repair', '-Editor', $k) }
    Start-Step "Repair $(if ($st.single) { '' } else { $EditorLabels[$k] + ' ' })in $($st.path)..." $st.path $extra {
        param($o, $s) $x = @($o)[0]; $c = Get-Counts $x.text $PlanPattern; $s.restored += [int]$c['create'] + [int]$c['update']
        Write-Log ($x.text + "`r`n== Repair $($EditorLabels[$s.current]) $(if ($x.code -eq 0) { 'finished' } else { "stopped (exit code $($x.code))" }) ==")
        [void]$s.report.Add("$($EditorLabels[$s.current]) $(if ($x.code -eq 0) { 'repaired' } else { 'NOT repaired' })"); Step-Repair $s } $st
}
function Complete-Simple($r, $st) {
    if ($st.action -eq 'Uninstall' -and $r.code -eq 0) { Remove-Repo $st.path; Set-Outcome $st.path '' }
    if ($st.action -eq 'Verify' -and $r.code -eq 0) { Set-Outcome $st.path '' }
    Write-Log ($r.text + "`r`n== $($st.action) $(if ($r.code -eq 0) { 'finished' } else { "stopped (exit code $($r.code))" }) ==")
    Update-Installations; Show-LocationStatus
    $eds = @([regex]::Matches($r.text, '(?m)^Editor (.+?): (OK|CHANGED|MISSING)') | ForEach-Object { "$($_.Groups[1].Value) $($_.Groups[2].Value)" })
    $lines = @("Target repository: $($st.path)")
    if ($st.action -eq 'Verify') { $lines += "Result: $(Get-VerifyLine $r)"; if ($eds.Count) { $lines += 'Editor configurations:'; $lines += @([regex]::Matches($r.text, '(?m)^Editor (.+?): (.+)$') | ForEach-Object { "  $($_.Groups[1].Value): $($_.Groups[2].Value)" }) } }
    else {
        $c = Get-Counts $r.text '(?m)^(remove|keep)[ ]+\S'
        $lines += if ($r.code -eq 0) { "Result: uninstalled. $([int]$c['remove']) files removed (backed up first), $([int]$c['keep']) edited files kept. PBIs, decisions, knowledge notes and backups are kept." } else { "Result: FAILED (exit code $($r.code)); removed files were restored. Show log for the reason." }
    }
    Set-Summary ($lines -join "`r`n")
    Set-Idle "$($st.action) $(if ($r.code -eq 0) { 'finished' } else { 'stopped' })$(if ($eds.Count) { ': ' + ($eds -join '; ') }). See the log."
}

# ---- Layout: every control is placed from the window size, so the window can be resized and maximized. Below its minimum
# the window scrolls instead of overlapping controls. The process is DPI-unaware: Windows scales the whole window. ----
$MinLayoutWidth = 880
function Set-RowLayout($row, [int]$width) {
    $sw = [Math]::Min(400, [Math]::Max(230, [int]($width * 0.3))); $bw = [Math]::Max(140, $width - 150 - 92 - $sw - 10)
    $y = $row.box.Top
    $row.box.SetBounds(150, $y, $bw, $row.box.Height); $row.browse.SetBounds(156 + $bw, $y - 1, 80, 25); $row.status.SetBounds(242 + $bw, $y + 4, $sw, 16)
}
function Update-Layout {
    $u = $script:ui; $f = $u.form
    if (-not $f -or $script:InLayout) { return }
    $script:InLayout = $true
    try {
        $f.SuspendLayout(); $ox = $f.AutoScrollPosition.X; $oy = $f.AutoScrollPosition.Y
        $W = [Math]::Max($f.ClientSize.Width, $MinLayoutWidth); $cw = $W - 24
        $rowH = $u.list.Font.Height + 4; $header = $rowH + 8
        $need = if ($script:LogShown) { 104 } else { 52 }   # the results area: summary alone, or summary and log side by side
        # Everything but the list and the results area, then the list gets 6 to 8 rows and the results the rest.
        $fixed = 44 + 125 + 6 + 64 + 184 + 36 + 38 + 24
        $avail = $f.ClientSize.Height - $fixed - 12 - $need
        $rows = [Math]::Min(8, [Math]::Max(6, [int][Math]::Floor(($avail - $header - 4) / $rowH)))
        $lh = $header + $rows * $rowH + 4
        $u.intro.SetBounds(12 + $ox, 8 + $oy, $cw, 32)
        $bx = $cw - 12 - 150; $lw = $bx - 22
        $u.known.SetBounds(12, 20, $lw, 16); $u.list.SetBounds(12, 38, $lw, $lh)
        $u.upgrade.SetBounds($bx, 38, 150, 28); $u.forget.SetBounds($bx, 72, 150, 28)
        $ly = 38 + $lh + 10
        $u.locLabel.SetBounds(12, $ly + 3, 110, 16); $u.location.SetBounds(124, $ly, $cw - 124 - 104, $u.location.Height); $u.locBrowse.SetBounds($cw - 92, $ly - 1, 80, 25)
        $u.locationStatus.SetBounds(124, $ly + 27, $cw - 136, 16)
        $ey = $ly + 47
        $u.edLabel.SetBounds(12, $ey + 3, 110, 16); $u.vs.SetBounds(124, $ey, 140, 22); $u.vscode.SetBounds(268, $ey, 140, 22); $u.editorStatus.SetBounds(412, $ey + 3, $cw - 424, 16)
        $gh = $ey + 30; $u.gi.SetBounds(12 + $ox, 44 + $oy, $cw, $gh)
        $y = 44 + $gh + 6
        $u.gl.SetBounds(12 + $ox, $y + $oy, $cw, 58); Set-RowLayout (Get-Row 'legacy') ($cw - 4); $y += 64
        $u.gr.SetBounds(12 + $ox, $y + $oy, $cw, 178); $u.refPanel.SetBounds(2, 18, $cw - 4, 156); $y += 184
        foreach ($r in @($script:Rows | Where-Object { $_.key -ne 'legacy' })) { Set-RowLayout $r ($u.refPanel.ClientSize.Width) }
        $u.targets.SetBounds(12 + $ox, $y + $oy, $cw, 32); $y += 36
        $x = 12; foreach ($b in $u.leftButtons) { $b.SetBounds($x + $ox, $y + $oy, $b.Width, 30); $x += $b.Width + 6 }
        $u.close.SetBounds($cw + 12 - 90 + $ox, $y + $oy, 90, 30); $u.logToggle.SetBounds($cw + 12 - 90 - 6 - 110 + $ox, $y + $oy, 110, 30); $y += 38
        $u.progress.SetBounds(12 + $ox, $y + 2 + $oy, 160, 14); $u.progressText.SetBounds(180 + $ox, $y + $oy, $cw - 168, 18); $y += 24
        $H = [Math]::Max($f.ClientSize.Height, $y + $need + 12); $bh = $H - 12 - $y
        $sw = if ($script:LogShown) { [int]($cw * 0.42) } else { $cw }
        $u.summary.SetBounds(12 + $ox, $y + $oy, $sw, $bh)
        $u.log.Visible = [bool]$script:LogShown
        if ($script:LogShown) { $u.log.SetBounds(18 + $sw + $ox, $y + $oy, $cw - $sw - 6, $bh) }
        $f.AutoScrollMinSize = New-Object System.Drawing.Size($MinLayoutWidth, ($y + $need + 12))
        $f.ResumeLayout()
        Update-ListColumns
    }
    finally { $script:InLayout = $false }
}

function New-SetupWindow {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $script:Colors = @{ ok = [System.Drawing.Color]::FromArgb(0, 110, 40); warning = [System.Drawing.Color]::FromArgb(150, 80, 0); error = [System.Drawing.Color]::FromArgb(180, 20, 20); info = [System.Drawing.Color]::DimGray; checking = [System.Drawing.Color]::DimGray }
    $script:Sha = [System.Security.Cryptography.SHA256]::Create(); $script:Outcome = @{}; $script:LogShown = $false
    $u = $script:ui
    # A moderately larger default that still fits the screen; resizable and maximizable.
    $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $u.form = New-Ctl Form @{ Text = "Akzo SDD PBI Builder $PackageVersion - Setup"; StartPosition = 'CenterScreen'; MaximizeBox = $true; AutoScroll = $true; Name = 'SetupWindow' }
    $u.form.ClientSize = New-Object System.Drawing.Size([Math]::Min(1120, $wa.Width - 40), [Math]::Min(800, $wa.Height - 50))
    $u.form.MinimumSize = New-Object System.Drawing.Size(760, 520)
    $u.tips = New-Object System.Windows.Forms.ToolTip
    $u.timer = New-Ctl Timer @{ Interval = 150 }; $u.timer.Add_Tick({ Complete-Jobs })
    $u.intro = New-Ctl Label @{ Name = 'Intro'; Text = "This package: $PackageVersion. Choose where to install the PBI Builder and the repositories it reads, then click Install / Upgrade. Files you edited are never overwritten; replaced files are backed up in playbook\pbi-builder\backups\." }

    $u.gi = New-Ctl GroupBox @{ Text = 'Installation'; Name = 'InstallationGroup' }
    $u.known = New-Ctl Label @{ Name = 'KnownLabel'; Text = 'Remembered installations (status checked against the installed files): click one to open it; tick older ones to upgrade them together.'; AutoEllipsis = $true }
    $u.list = New-Ctl ListView @{ View = 'Details'; FullRowSelect = $true; CheckBoxes = $true; MultiSelect = $false; HideSelection = $false; ShowItemToolTips = $true; Name = 'InstallationList'; AccessibleName = 'Remembered installations' }
    foreach ($c in @(@('Installation location', 400), @('Version', 70), @('Editors', 170), @('Status', 125), @('Required', 80))) { [void]$u.list.Columns.Add($c[0], $c[1]) }
    $u.upgrade = New-Ctl Button @{ Text = 'Upgrade ticked (0)'; Name = 'UpgradeTickedButton' }
    $u.forget = New-Ctl Button @{ Text = 'Remove from list'; Name = 'ForgetButton' }
    $u.locLabel = New-Ctl Label @{ Name = 'LocationLabel'; Text = 'Install location:' }
    $u.location = New-Ctl TextBox @{ Name = 'LocationBox'; AccessibleName = 'Install location path' }
    $u.locBrowse = New-Ctl Button @{ Text = 'Browse...'; Name = 'LocationBrowse'; AccessibleName = 'Browse for the install location' }
    $u.locationStatus = New-Ctl Label @{ AutoEllipsis = $true; Name = 'LocationStatus' }
    $u.edLabel = New-Ctl Label @{ Name = 'EditorLabel'; Text = 'Editor:' }
    $u.vs = New-Ctl CheckBox @{ Text = 'Visual Studio 2026'; Name = 'EditorVisualStudio'; Checked = ($Ide -ne 'vscode') }
    $u.vscode = New-Ctl CheckBox @{ Text = 'Visual Studio Code'; Name = 'EditorVSCode'; Checked = ($Ide -ne 'visualstudio') }
    $u.editorStatus = New-Ctl Label @{ AutoEllipsis = $true; Name = 'EditorStatus' }
    $u.vs.Add_CheckedChanged({ if (-not $script:Filling) { Show-EditorStatus } }); $u.vscode.Add_CheckedChanged({ if (-not $script:Filling) { Show-EditorStatus } })
    $u.gi.Controls.AddRange(@($u.known, $u.list, $u.upgrade, $u.forget, $u.locLabel, $u.location, $u.locBrowse, $u.locationStatus, $u.edLabel, $u.vs, $u.vscode, $u.editorStatus))

    $u.gl = New-Ctl GroupBox @{ Text = 'Primary source - Legacy CRM/XRM (business reference)'; Name = 'LegacyGroup'; Width = 916; Height = 58 }
    $script:Rows = @(New-PathRow $u.gl 22 'legacy' 'Legacy CRM/XRM' 'Legacy')
    $u.gr = New-Ctl GroupBox @{ Text = 'Reference repositories (read only)'; Name = 'ReferenceGroup'; Width = 916; Height = 178 }
    $u.refPanel = New-Ctl Panel @{ Left = 2; Top = 18; Width = 912; Height = 156; AutoScroll = $true; Name = 'ReferencePanel' }
    $u.gr.Controls.Add($u.refPanel)
    $i = 0; foreach ($k in $SourceRows.Keys) { $script:Rows += New-PathRow $u.refPanel (4 + 30 * $i) $k $SourceRows[$k] ((Get-Culture).TextInfo.ToTitleCase($k)); $i++ }
    $u.targets = New-Ctl Label @{ Name = 'TargetsNote'; Text = 'CDMS, DAB and Shared Angular UI are independent implementation targets. UI is optional. The folders above are read-only references: setup never selects an implementation target; each PBI selects its own targets when it is created.' }

    $mk = { param($text, $width, $name) New-Ctl Button @{ Width = $width; Height = 30; Text = $text; Name = $name } }
    $install = & $mk 'Install / Upgrade' 130 'InstallButton'; $validate = & $mk 'Validate paths' 110 'ValidateButton'
    $verify = & $mk 'Verify' 90 'VerifyButton'; $repair = & $mk 'Repair' 90 'RepairButton'; $uninstall = & $mk 'Uninstall' 90 'UninstallButton'
    $u.leftButtons = @($install, $validate, $verify, $repair, $uninstall)
    $u.close = & $mk 'Close' 90 'CloseButton'; $u.logToggle = & $mk 'Show log' 110 'LogToggleButton'
    $u.progress = New-Ctl ProgressBar @{ Style = 'Marquee'; MarqueeAnimationSpeed = 30; Visible = $false; Name = 'Progress' }
    $u.progressText = New-Ctl Label @{ AutoEllipsis = $true; Text = 'Ready.'; Name = 'ProgressText' }
    $u.summary = New-Ctl TextBox @{ Multiline = $true; ReadOnly = $true; ScrollBars = 'Vertical'; BackColor = [System.Drawing.SystemColors]::Window; Font = New-Object System.Drawing.Font('Segoe UI', 9); Name = 'Summary'; AccessibleName = 'Result summary'; Text = 'Results appear here after Install / Upgrade, Verify, Repair or Uninstall: files installed, updated, preserved, backed up and failed, the target repository, the editor configurations and the verification. Show log shows every step.' }
    $u.log = New-Ctl TextBox @{ Multiline = $true; ScrollBars = 'Vertical'; ReadOnly = $true; Font = New-Object System.Drawing.Font('Consolas', 8.5); Visible = $false; Name = 'Log'; AccessibleName = 'Installer log' }
    $u.form.Controls.AddRange(@($u.intro, $u.gi, $u.gl, $u.gr, $u.targets) + $u.leftButtons + @($u.logToggle, $u.close, $u.progress, $u.progressText, $u.summary, $u.log))
    $u.groups = @($u.gi, $u.gl, $u.gr)
    $u.lock = @($u.gi, $u.gl, $u.gr) + $u.leftButtons

    $u.form.Add_Resize({ Update-Layout }); $u.refPanel.Add_ClientSizeChanged({ Update-Layout }); $u.list.Add_SizeChanged({ Update-ListColumns -Resized }); $u.list.Add_ColumnWidthChanged({ if (-not $script:SettingColumns) { $script:UserColumns = $true } })
    $u.logToggle.Add_Click({ $script:LogShown = -not $script:LogShown; $script:ui.logToggle.Text = $(if ($script:LogShown) { 'Hide log' } else { 'Show log' }); Update-Layout })
    $u.location.Add_Leave({ if (-not $script:Busy) { Open-Installation $script:ui.location.Text } })
    $u.location.Add_KeyDown({ if ($_.KeyCode -eq 'Return') { $_.SuppressKeyPress = $true; Open-Installation $script:ui.location.Text } })
    $u.locBrowse.Add_Click({ $p = Select-Folder 'Select the installation location: the repository root that will hold playbook\pbi-builder' (Get-LocationFull); if ($p) { Open-Installation $p } })
    $u.list.Add_ItemSelectionChanged({ if ($_.IsSelected -and -not $script:Filling) { Open-Installation $_.Item.Tag.path } })
    $u.list.Add_ItemCheck({ if (-not $script:Filling -and $_.NewValue -eq 'Checked' -and -not $script:ui.list.Items[$_.Index].Tag.outdated) { $_.NewValue = 'Unchecked' } })
    $u.list.Add_ItemChecked({ if (-not $script:Filling) { Update-UpgradeButton } })
    $u.upgrade.Add_Click({ Start-UpgradeTicked })
    $u.forget.Add_Click({ $it = @($script:ui.list.SelectedItems)[0]; if ($it) { Remove-Repo $it.Tag.path; Update-Installations; Write-Log "Removed $($it.Tag.path) from the list. Nothing in the repository was changed." } })
    $install.Add_Click({ Start-Install })
    $validate.Add_Click({ Show-LocationStatus; Update-Validation -Fresh; Update-Installations; $script:ui.progressText.Text = 'Paths and installations checked again; see the status beside each one.' })
    $verify.Add_Click({ Start-Simple 'Verify' }); $repair.Add_Click({ Start-Simple 'Repair' }); $uninstall.Add_Click({ Start-Simple 'Uninstall' })
    $u.close.Add_Click({ $script:ui.form.Close() })
    $u.form.Add_FormClosing({
            if ($script:Busy) { $_.Cancel = $true; [void](Show-Message 'Wait until the current step finishes; closing now could interrupt the installer.' 'Setup'); return }
            if ((Test-Unsaved) -and -not (Confirm-Discard)) { $_.Cancel = $true }
        })
    Update-Layout
    return $u.form
}
function Get-AllControls($c) { foreach ($x in $c.Controls) { $x; Get-AllControls $x } }
function Get-WindowInfo {
    $s = Get-WindowSettings
    return [ordered]@{
        title = $script:ui.form.Text
        groups = @($script:ui.groups | ForEach-Object { [ordered]@{ text = $_.Text; top = $_.Top } })
        columns = @($script:ui.list.Columns | ForEach-Object { $_.Text }); itemToolTips = $script:ui.list.ShowItemToolTips
        installations = @($script:ui.list.Items | ForEach-Object { [ordered]@{ path = $_.Text; version = $_.SubItems[1].Text; editors = $_.SubItems[2].Text; status = $_.SubItems[3].Text; required = $_.SubItems[4].Text; ticked = $_.Checked; tooltip = $_.ToolTipText } })
        summary = $script:ui.summary.Text; logToggle = $script:ui.logToggle.Text; resizable = ($script:ui.form.FormBorderStyle -eq 'Sizable' -and $script:ui.form.MaximizeBox)
        location = [ordered]@{ path = $script:ui.location.Text; status = $script:ui.locationStatus.Text }
        editor = $s.ide; editors = @($EditorLabels.Keys | Where-Object { ($_ -eq 'visualstudio' -and $script:ui.vs.Checked) -or ($_ -eq 'vscode' -and $script:ui.vscode.Checked) }); checkboxes = @($script:ui.vs.Text, $script:ui.vscode.Text); editorStatus = $script:ui.editorStatus.Text; targets = $script:ui.targets.Text
        rows = @($script:Rows | ForEach-Object { [ordered]@{ key = $_.key; label = $_.title.Text; path = $_.box.Text; status = $_.status.Text; browse = $_.browse.Text } })
        buttons = @(Get-AllControls $script:ui.form | Where-Object { $_ -is [System.Windows.Forms.Button] } | ForEach-Object { $_.Text })
        role = $s.role; arguments = @($s.args); errors = @($s.errors); warnings = @($s.warnings); unsaved = (Test-Unsaved)
    }
}

# JSON for -NoGui output with non-ASCII characters escaped, so console code pages cannot change paths.
function ConvertTo-AsciiJson($o) { return [regex]::Replace((ConvertTo-Json -InputObject $o -Depth 6 -Compress), '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value }) }

if ($NoGui) {
    if (-not $Action) { throw '-NoGui needs -Action Install, Upgrade, Repair, Verify, Uninstall, Status, Detect or WindowTest.' }
    if ($Action -eq 'Detect') { foreach ($t in $Repo) { Write-Output (ConvertTo-AsciiJson (Get-SourceSummary (Resolve-SourcePath (Get-Location).Path $t))) }; exit 0 }
    if ($Action -eq 'WindowTest') {
        $script:Sync = $true; [void](New-SetupWindow); Update-Installations
        if ($Repo) { Open-Installation $Repo[0] }
        foreach ($pair in @(([string]$Set) -split '\|' | Where-Object { $_ })) {
            $i = $pair.IndexOf('='); $k = $pair.Substring(0, $i); $v = $pair.Substring($i + 1)
            if ($k -eq 'location') { Open-Installation $v }
            elseif ($k -eq 'editor') { $script:ui.vs.Checked = ($v -split ',') -contains 'visualstudio'; $script:ui.vscode.Checked = ($v -split ',') -contains 'vscode'; Show-EditorStatus }
            else { $r = @($script:Rows | Where-Object { $_.key -eq $k -and ($k -ne 'custom' -or -not $_.box.Text.Trim()) })[0]; $r.box.Text = $v; Update-Validation }
        }
        Write-Output (ConvertTo-AsciiJson (Get-WindowInfo)); exit 0
    }
    $targets = if ($Repo) { $Repo } elseif ($Action -eq 'Upgrade') { Get-UpgradeTargets } else { Get-Repos }
    $failed = 0
    if ($Action -eq 'Status') { foreach ($t in Get-Repos) { Write-Output "$t : $(Get-RepoStatus $t)" }; exit 0 }
    foreach ($t in $targets) {
        Write-Output "== $Action $t"
        switch ($Action) {
            { $_ -in 'Install', 'Upgrade' } { $r = Invoke-InstallFlow $t $Ide $Role { $true }; Write-Output $r.text; if (-not $r.ok) { $failed++ } }
            'Uninstall' { $r = Invoke-Engine $t @('-Action', 'Uninstall'); Write-Output $r.text; if ($r.code -eq 0) { Remove-Repo $t } else { $failed++ } }
            default { $r = Invoke-Engine $t @('-Action', $Action); Write-Output $r.text; if ($r.code -ne 0) { $failed++ } }
        }
    }
    if (-not @($targets).Count) { Write-Output 'No repositories to process.' }
    exit $(if ($failed) { 3 } else { 0 })
}

$form = New-SetupWindow
Update-Installations
$last = if (Test-Path -LiteralPath $LastFile) { ([System.IO.File]::ReadAllText($LastFile, $Utf8)).Trim() } else { '' }
$first = if ($last -and @(Get-Repos) -contains $last) { $last } else { @(Get-Repos)[0] }
if ($first) { Open-Installation $first } else { Show-LocationStatus; Update-Validation }
[void]$form.ShowDialog()
