<#
.SYNOPSIS
Installs, upgrades, verifies, repairs or uninstalls the Akzo SDD PBI Builder in a
repository, checks a PBI's readiness, refreshes evidence fingerprints, or records
an explicit final approval and generates the refined PBI documents.

.DESCRIPTION
Reads pbi-builder-bundle.json, which is generated from the same core.js as the HTML
wizard, so both installers write identical files for the same settings.
Never overwrites user-edited files, existing PBIs, knowledge notes, shared Copilot
instructions or unrelated agents. Updates and retirements are backed up under
playbook/pbi-builder/backups/. Respects the execution policy; never changes it.

Run without -RepoPath for guided mode (folder picker and prompts).

.EXAMPLE
.\Install-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -ProjectName "My Repo" -Ide vscode -Role dab -Preview
.EXAMPLE
.\Install-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -AllowUpdates
.EXAMPLE
.\Install-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -Ide both -AllowUpdates
(Visual Studio 2026 and VS Code: one agent file for each editor, every other file shared.)
.EXAMPLE
.\Install-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -Action Repair -Editor vscode
(Repairs or, with Install, upgrades one editor and the shared files; the other editor's agent file is left as it is.)
.EXAMPLE
.\Install-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -Action CheckPbi -Pbi pbi-300186-formula-20261027-ab12cd34
.EXAMPLE
.\Install-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -Action SyncPbi -Pbi pbi-300186-formula-20261027-ab12cd34 -RefreshEvidence -Json
(Resume in one run: refreshes the evidence index, then synchronizes and reports readiness.)
.EXAMPLE
.\Install-PBIBuilder.ps1 -RepoPath "C:\src\My Repo" -Action ApproveAndGenerate -Pbi pbi-300186-formula-20261027-ab12cd34 -Approver "Product Owner" -ReviewedContent <64-character-fingerprint>
#>
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Verify', 'Repair', 'Uninstall', 'CheckPbi', 'SyncPbi', 'RefreshEvidence', 'ApproveAndGenerate', 'RecordAnswer', 'DeferQuestion', 'SetTargets')]
    [string]$Action = 'Install',
    [string]$RepoPath,
    [string]$ProjectName,
    [ValidateSet('visualstudio', 'vscode', 'both')][string]$Ide,
    [ValidateSet('legacy', 'dab', 'cdms', 'ui', 'other')][string]$Role,
    [string]$LegacySource,
    [string]$DabSource,
    [string]$CdmsSource,
    [string]$UiSource,
    [string[]]$OtherSource,
    [ValidateSet('legacy', 'dab', 'cdms', 'ui')][string[]]$ClearSource,
    [switch]$NoReferences,
    [switch]$IncludeReferences,
    [switch]$Preview,
    [switch]$AllowUpdates,
    [string]$Pbi,
    [string]$Approver,
    [string]$ReviewedContent,
    [switch]$RefreshEvidence,
    [string]$Question,
    [string]$Option,
    [string]$Custom,
    [string]$AnsweredBy,
    [string[]]$Targets,
    [ValidateSet('visualstudio', 'vscode')][string]$Editor,
    [switch]$Json
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Sha = [System.Security.Cryptography.SHA256]::Create()
# Source keys in core.js order (SOURCE_KEYS).
$SourceKeys = @('legacy', 'dab', 'cdms', 'ui')
$Ordinal = [System.StringComparison]::Ordinal
$script:Bound = $PSBoundParameters
$Interactive = -not $PSBoundParameters.ContainsKey('RepoPath')
$script:Repo = $null

# ---- JSON-compatible helpers (values from ConvertFrom-Json; property names case-sensitive, as in JavaScript) ----
function Get-Prop($o, [string]$name) {
    if ($o -is [System.Management.Automation.PSCustomObject]) { $p = $o.PSObject.Properties[$name]; if ($p -and $p.Name -ceq $name) { return , $p.Value } }
    return $null
}
function Test-Has($o, [string]$name) { if (-not ($o -is [System.Management.Automation.PSCustomObject])) { return $false }; $p = $o.PSObject.Properties[$name]; return ($null -ne $p) -and ($p.Name -ceq $name) }
function Set-Prop($o, [string]$name, $value) {
    $p = $o.PSObject.Properties[$name]
    if ($p) { $p.Value = $value } else { Add-Member -InputObject $o -NotePropertyName $name -NotePropertyValue $value }
}
function Test-Obj($x) { return $x -is [System.Management.Automation.PSCustomObject] }
function Test-Str($x) { return ($x -is [string]) -and ($x.Trim() -ne '') }
function Test-Num($x) { return ($x -is [int]) -or ($x -is [long]) -or ($x -is [decimal]) -or ($x -is [double]) }
function Test-Rev($x) { return (Test-Num $x) -and ($x -ge 1) -and ([math]::Floor($x) -eq $x) }
function Test-One($x) { return (Test-Num $x) -and ($x -eq 1) }
function Test-Same($a, $b) { return ($a -is [string]) -and ($b -is [string]) -and [string]::Equals($a, $b, $Ordinal) }
function Test-In($list, $x) { foreach ($i in $list) { if (Test-Same $i $x) { return $true } }; return $false }
function Get-Arr($x) { if ($x -is [array]) { return , $x }; return , @() }
function Test-SameText($a, $b) { if ($null -eq $a -or $null -eq $b) { return ($null -eq $a) -and ($null -eq $b) }; return [string]::Equals($a, $b, $Ordinal) }
function New-Map { return New-Object 'System.Collections.Generic.Dictionary[string,object]' ([System.StringComparer]::Ordinal) }

# Characters JSON.stringify escapes: quote, backslash, controls and any UTF-16 surrogate (paired ones are kept as-is by the loop).
$script:JsEscapeNeeded = New-Object System.Text.RegularExpressions.Regex('["\\\x00-\x1f\uD800-\uDFFF]', [System.Text.RegularExpressions.RegexOptions]::Compiled)
# Same output as JavaScript JSON.stringify(string) without the quotes.
function ConvertTo-JsEscaped([string]$s) {
    if (-not $script:JsEscapeNeeded.IsMatch($s)) { return $s }
    $sb = New-Object System.Text.StringBuilder
    for ($i = 0; $i -lt $s.Length; $i++) {
        $n = [int]$s[$i]
        if ($n -eq 34) { [void]$sb.Append('\"') }
        elseif ($n -eq 92) { [void]$sb.Append('\\') }
        elseif ($n -eq 8) { [void]$sb.Append('\b') }
        elseif ($n -eq 9) { [void]$sb.Append('\t') }
        elseif ($n -eq 10) { [void]$sb.Append('\n') }
        elseif ($n -eq 12) { [void]$sb.Append('\f') }
        elseif ($n -eq 13) { [void]$sb.Append('\r') }
        elseif ($n -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $n)) }
        elseif ($n -ge 0xD800 -and $n -le 0xDBFF -and $i + 1 -lt $s.Length -and [int]$s[$i + 1] -ge 0xDC00 -and [int]$s[$i + 1] -le 0xDFFF) { [void]$sb.Append($s[$i]).Append($s[$i + 1]); $i++ }
        elseif ($n -ge 0xD800 -and $n -le 0xDFFF) { [void]$sb.Append(('\u{0:x4}' -f $n)) }
        else { [void]$sb.Append($s[$i]) }
    }
    return $sb.ToString()
}

# ---- Files relative to the repository root ----
function Test-SafePath($path) {
    if (-not ($path -is [string]) -or $path -eq '' -or $path.Contains('\') -or $path.StartsWith('/')) { return $false }
    # Windows device names and trailing dots/spaces silently alias other files, so they are rejected too.
    foreach ($s in $path.Split('/')) { if ($s -eq '' -or $s -eq '.' -or $s -eq '..' -or $s -match '[\x00-\x1f<>:"|?*]' -or $s -match '[. ]$' -or $s -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$') { return $false } }
    return $true
}
function Get-Full([string]$rel) {
    if (-not (Test-SafePath $rel)) { throw "Invalid relative file path: $rel" }
    $full = $script:Repo
    foreach ($part in $rel.Split('/')) {
        $full = [System.IO.Path]::Combine($full, $part)
        try { $attributes = [System.IO.File]::GetAttributes($full) }
        catch [System.IO.FileNotFoundException] { continue }
        catch [System.IO.DirectoryNotFoundException] { continue }
        if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Repository path contains a junction or reparse point; refusing access: $rel"
        }
    }
    return $full
}
function Read-Text([string]$rel) { $f = Get-Full $rel; if ([System.IO.File]::Exists($f)) { return [System.IO.File]::ReadAllText($f, $Utf8) }; return $null }
function Write-Text([string]$rel, [string]$text) {
    $f = Get-Full $rel
    [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($f))
    [System.IO.File]::WriteAllText($f, $text, $Utf8)
}
function Remove-File([string]$rel) { $f = Get-Full $rel; if ([System.IO.File]::Exists($f)) { [System.IO.File]::Delete($f) } }
function Get-Hash([byte[]]$bytes) { return [BitConverter]::ToString($Sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
function Get-TextHash([string]$t) { return Get-Hash $Utf8.GetBytes($t) }
function Get-Batch { return [DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) }

# ---- Generation contract ----
function Read-Bundle {
    $path = Join-Path $PSScriptRoot 'pbi-builder-bundle.json'
    if (-not [System.IO.File]::Exists($path)) { throw 'pbi-builder-bundle.json is missing next to this script. Use the complete package.' }
    try { $t = [System.IO.File]::ReadAllText($path, $Utf8); $script:BundleHash = Get-TextHash $t; $b = $t | ConvertFrom-Json } catch { throw "pbi-builder-bundle.json is not valid JSON: $($_.Exception.Message)" }
    if (-not (Test-One (Get-Prop $b 'schemaVersion'))) { throw "Unsupported bundle schemaVersion '$(Get-Prop $b 'schemaVersion')'. This installer reads version 1; use the installer from the same package." }
    return $b
}
function Read-Line($value, [int]$max, [string]$what) {
    $s = ([string]$value).Trim()
    if ($s -eq '' -or $s -match '[\x00-\x1f]' -or $s.Length -gt $max) { throw "Enter a single-line $what (1-$max characters)." }
    return $s
}
# Mirrors normalizeConfig() in core.js.
function New-Config($in) {
    if ($null -ne $in.schemaVersion -and -not (Test-One $in.schemaVersion)) { throw "Unsupported config schemaVersion $($in.schemaVersion); this package reads version 1." }
    $name = Read-Line $in.projectName 100 'project name'
    $ideValue = if ([string]$in.ide -ceq 'vscode' -or [string]$in.ide -ceq 'both') { [string]$in.ide } else { 'visualstudio' }
    if (-not (Test-In @('legacy', 'dab', 'cdms', 'ui', 'other') ([string]$in.role))) { throw 'Choose the role of this repository: legacy, dab, cdms, ui or other.' }
    $sources = [ordered]@{}
    foreach ($k in $SourceKeys) {
        $v = ([string]$in.sources[$k]).Trim()
        if ($v -match '[\x00-\x1f]') { throw 'Source paths must be on one line.' }
        if ($v -match '[<>"|?*]') { throw 'Source paths cannot contain < > " | ? * (not valid in Windows paths).' }
        $sources[$k] = $v.Replace('\', '/')
    }
    if ($in.role -cne 'other') { $sources[[string]$in.role] = '.' }
    $raw = @($in.others | Where-Object { $null -ne $_ })
    if ($raw.Count -gt 10) { throw 'Configure at most 10 other repositories.' }
    $others = @()
    foreach ($o in $raw) {
        $n = Read-Line $o.name 60 'name'
        $p = ([string]$o.path).Trim().Replace('\', '/')
        if ($p -eq '' -or $p -match '[\x00-\x1f]') { throw "Give each other repository one path on one line: $n" }
        if ($p -match '[<>"|?*]') { throw 'Source paths cannot contain < > " | ? * (not valid in Windows paths).' }
        if ((Test-In $SourceKeys $n.ToLowerInvariant()) -or @($others | Where-Object { $_.name.ToLowerInvariant() -ceq $n.ToLowerInvariant() }).Count) { throw "Other repository names must be unique and not Legacy, DAB, CDMS or UI: $n" }
        $others += [pscustomobject]@{ name = $n; path = $p }
    }
    return [ordered]@{ schemaVersion = 1; packageVersion = [string]$Bundle.packageVersion; projectName = $name; ide = $ideValue; role = [string]$in.role
        agentName = [string]$Bundle.agentPrefix + $name; includeReferences = [bool]$in.includeReferences; sources = $sources; others = $others }
}
function ConvertTo-ConfigJson($c) {
    $q = { param($v) '"' + (ConvertTo-JsEscaped $v) + '"' }
    # Same layout as JSON.stringify(config, null, 2).
    $others = if ($c.others.Count) { "[`n" + (@($c.others | ForEach-Object { "    {`n      `"name`": $(& $q $_.name),`n      `"path`": $(& $q $_.path)`n    }" }) -join ",`n") + "`n  ]" } else { '[]' }
    return (@('{', '  "schemaVersion": 1,', "  `"packageVersion`": $(& $q $c.packageVersion),", "  `"projectName`": $(& $q $c.projectName),",
            "  `"ide`": $(& $q $c.ide),", "  `"role`": $(& $q $c.role),", "  `"agentName`": $(& $q $c.agentName),",
            "  `"includeReferences`": $(if ($c.includeReferences) { 'true' } else { 'false' }),", '  "sources": {',
            "    `"legacy`": $(& $q $c.sources.legacy),", "    `"dab`": $(& $q $c.sources.dab),", "    `"cdms`": $(& $q $c.sources.cdms),", "    `"ui`": $(& $q $c.sources.ui)", '  },', "  `"others`": $others", '}') -join "`n")
}
function Get-Values($c) {
    $v = New-Map
    $v['PROJECT'] = $c.projectName; $v['PROJECT_ESC'] = ConvertTo-JsEscaped $c.projectName; $v['ROLE'] = $c.role
    $v['SRC_LEGACY_ESC'] = ConvertTo-JsEscaped $c.sources.legacy; $v['SRC_DAB_ESC'] = ConvertTo-JsEscaped $c.sources.dab; $v['SRC_CDMS_ESC'] = ConvertTo-JsEscaped $c.sources.cdms; $v['SRC_UI_ESC'] = ConvertTo-JsEscaped $c.sources.ui
    $v['ANALYSIS_DOCS'] = if ($c.includeReferences) { [string]$Bundle.analysisDocs.included } else { [string]$Bundle.analysisDocs.excluded }
    $v['OTHER_SOURCES'] = if ($c.others.Count) { -join @($c.others | ForEach-Object { "`n  - name: `"$(ConvertTo-JsEscaped $_.name)`"`n    repositoryPath: `"$(ConvertTo-JsEscaped $_.path)`"" }) } else { [string]$Bundle.analysisDocs.excluded }
    $v['CONFIG_JSON'] = ConvertTo-ConfigJson $c
    $ideProfile = Get-Prop $Bundle.ideProfiles $c.ide
    foreach ($p in $ideProfile.PSObject.Properties) { $v[$p.Name] = [string]$p.Value }
    $n = [string]$Bundle.agentPrefix + $c.projectName; $both = Get-Prop $Bundle.ideProfiles 'both'
    $v['PROMPT_AGENT'] = if ($c.ide -ceq 'both') { '' } else { 'agent: "' + [string]$Bundle.agentPrefix + (ConvertTo-JsEscaped $c.projectName) + "`"`n" }
    $v['OPEN_AND_SELECT'] = if ($c.ide -ceq 'both') { "Open this repository in $($both.IDE_LABEL), then select the agent for that editor in Copilot Chat:`n- Visual Studio: $n$($both.AGENT_SUFFIX)`n- VS Code: $n (VS Code)" } else { "Open this repository in $($ideProfile.IDE_LABEL), then select this agent in Copilot Chat:`n$n" }
    foreach ($t in $Bundle.tokens) { if (-not $v.ContainsKey($t)) { throw "The bundle declares placeholder $t that this installer cannot fill. Use the installer from the same package." } }
    return $v
}
function Invoke-Render([string]$template, $values, [string]$label) {
    $out = New-Object System.Text.StringBuilder; $last = 0
    foreach ($m in [regex]::Matches($template, '\{\{PBI:([A-Z0-9_]+)\}\}')) {
        $k = $m.Groups[1].Value
        if (-not $values.ContainsKey($k)) { throw "Unresolved placeholder {{PBI:$k}} in $label" }
        [void]$out.Append($template, $last, $m.Index - $last).Append($values[$k]); $last = $m.Index + $m.Length
    }
    return $out.Append($template, $last, $template.Length - $last).ToString()
}
function Get-SetupFiles($c, [string]$html) {
    $values = Get-Values $c
    $files = New-Object System.Collections.Specialized.OrderedDictionary ([System.StringComparer]::Ordinal)
    foreach ($t in $Bundle.setup) {
        $when = [string](Get-Prop $t 'when')
        if ($when -and -not (Test-When $c $when)) { continue }
        if ((Get-Prop $t 'source') -ceq 'html') { $files[$t.path] = $html }
        elseif ((Get-Prop $t 'source') -ceq 'installer') { $files[$t.path] = [System.IO.File]::ReadAllText($PSCommandPath, $Utf8) }
        elseif ((Get-Prop $t 'source') -ceq 'bundle') { $files[$t.path] = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'pbi-builder-bundle.json'), $Utf8) }
        elseif (Test-Has $t 'text') { $files[$t.path] = [string]$t.text }
        else {
            $vals = $values; $over = Get-Prop $t 'values'
            if ($null -ne $over) { $vals = New-Map; foreach ($k in $values.Keys) { $vals[$k] = $values[$k] }; foreach ($p in $over.PSObject.Properties) { $vals[$p.Name] = [string]$p.Value } }
            $files[$t.path] = Invoke-Render ([string]$t.template) $vals $t.path
        }
    }
    return $files
}
# A setup entry's when: a config flag (includeReferences) or key=value (ide=both), as whenMet() in core.js.
function Test-When($c, [string]$w) { $i = $w.IndexOf('='); if ($i -lt 0) { return [bool]$c[$w] }; return ([string]$c[$w.Substring(0, $i)]) -ceq $w.Substring($i + 1) }
# Editors of an installation and their agent files, as editorAgents() in core.js: one editor uses the agent path; both add the VS Code agent.
function Get-EditorAgents([string]$ide) {
    $m = [ordered]@{}
    if ($ide -ceq 'both') { $m['visualstudio'] = [string]$Bundle.agentPath; $m['vscode'] = [string]$Bundle.vscodeAgentPath }
    else { $m[$(if ($ide -ceq 'vscode') { 'vscode' } else { 'visualstudio' })] = [string]$Bundle.agentPath }
    return $m
}
function Get-EditorLabel([string]$k) { return [string](Get-Prop $Bundle.editors $k) }
function Get-EditorAgentName($c, [string]$k) { return $c.agentName + $(if ($c.ide -ceq 'both') { if ($k -ceq 'vscode') { ' (VS Code)' } else { ' (Visual Studio)' } } else { '' }) }
# -Editor limits Install and Repair to that editor and the shared files: the other editor's agent file is planned as kept.
function Get-KeptAgents($c) {
    $agents = Get-EditorAgents $c.ide
    if (-not $script:Bound.ContainsKey('Editor')) { return @() }
    if (-not $agents.Contains($Editor)) { throw "-Editor $Editor is not an editor of this installation ($(@($agents.Keys | ForEach-Object { Get-EditorLabel $_ }) -join ', ')). Choose the editors with -Ide visualstudio, vscode or both." }
    return @($agents.Keys | Where-Object { $_ -cne $Editor } | ForEach-Object { $agents[$_] })
}
function Get-BaselineText($c, $baseline) { return Invoke-Render ([string]$baseline.template) (Get-Values $c) $baseline.path }

# ---- Plan and apply: same states and order as plan()/apply() in core.js ----
function Read-Manifest {
    $raw = Read-Text $Bundle.manifest
    if ($null -eq $raw) { return $null }
    try { $m = $raw | ConvertFrom-Json } catch { throw 'The existing installation record is invalid. Preserve it and compare manually.' }
    if (-not (Test-One (Get-Prop $m 'schemaVersion')) -or -not (Test-Obj (Get-Prop $m 'files'))) { throw 'Unrecognized installation record.' }
    return $m
}
function ConvertTo-ManifestJson($rows) {
    $entries = @($rows | Where-Object { $null -ne $_.text -or $_.hash } | ForEach-Object { '    "' + (ConvertTo-JsEscaped $_.path) + '": "' + $(if ($null -ne $_.text) { Get-TextHash $_.text } else { $_.hash }) + '"' })
    $files = if ($entries.Count) { "{`n" + ($entries -join ",`n") + "`n  }" } else { '{}' }
    return "{`n  `"schemaVersion`": 1,`n  `"packageVersion`": `"$(ConvertTo-JsEscaped $Bundle.packageVersion)`",`n  `"files`": $files`n}`n"
}
function Get-Plan($files, [string[]]$keep = @()) {
    $old = Read-Manifest
    $owned = New-Map
    if ($old) { foreach ($p in $old.files.PSObject.Properties) { $owned[$p.Name] = $p.Value } }
    $rows = New-Object System.Collections.ArrayList
    foreach ($path in $files.Keys) {
        $text = $files[$path]; $before = Read-Text $path
        if ($keep -ccontains $path) { [void]$rows.Add([pscustomobject]@{ path = $path; text = $null; before = $before; state = 'kept'; hash = $(if ($owned.ContainsKey($path)) { [string]$owned[$path] } else { $null }) }); continue }
        $state = if ($null -eq $before) { 'create' } elseif (Test-SameText $before $text) { 'unchanged' } else { 'conflict' }
        if ($state -ceq 'conflict' -and $owned.ContainsKey($path) -and (Test-Same $owned[$path] (Get-TextHash $before))) { $state = 'update' }
        [void]$rows.Add([pscustomobject]@{ path = $path; text = $text; before = $before; state = $state; hash = $null })
    }
    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($p in @($owned.Keys) + @($Bundle.legacyFiles)) { if (-not $candidates.Contains($p)) { $candidates.Add($p) } }
    foreach ($path in $candidates) {
        if ($files.Contains($path) -or $path -ceq $Bundle.manifest) { continue }
        $before = Read-Text $path
        if ($null -eq $before) { continue }
        $state = if ($owned.ContainsKey($path) -and (Test-Same $owned[$path] (Get-TextHash $before))) { 'retire' } else { 'retire-conflict' }
        [void]$rows.Add([pscustomobject]@{ path = $path; text = $null; before = $before; state = $state; hash = $null })
    }
    $text = ConvertTo-ManifestJson $rows; $before = Read-Text $Bundle.manifest
    $state = if ($null -eq $before) { 'create' } elseif (Test-SameText $before $text) { 'unchanged' } else { 'update' }
    [void]$rows.Add([pscustomobject]@{ path = $Bundle.manifest; text = $text; before = $before; state = $state; hash = $null })
    return , $rows
}
function Invoke-Apply($rows, [bool]$allow) {
    $blocked = @($rows | Where-Object { $_.state -ceq 'conflict' })
    if ($blocked.Count) { throw ("Existing files differ. Nothing was written. Resolve these files first:`n" + (($blocked | ForEach-Object { $_.path }) -join "`n")) }
    if (@($rows | Where-Object { $_.state -ceq 'update' -or $_.state -ceq 'retire' }).Count -and -not $allow) { throw 'Review and allow updates to the previously installed files (-AllowUpdates) before continuing.' }
    foreach ($r in $rows) { if (-not (Test-SameText (Read-Text $r.path) $r.before)) { throw "A file changed after review. Nothing was written. Review setup again: $($r.path)" } }
    $batch = Get-Batch; $touched = New-Object System.Collections.ArrayList; $backups = New-Object System.Collections.ArrayList
    $complete = $false; $message = 'Interrupted (for example Ctrl+C).'
    try {
        foreach ($r in @($rows | Where-Object { $_.state -ceq 'update' -or $_.state -ceq 'retire' })) {
            $b = "$($Bundle.base)/backups/$batch/$($r.path)"
            if ($null -ne (Read-Text $b)) { throw "Backup collision: $b" }
            Write-Text $b $r.before; [void]$backups.Add($b)
        }
        foreach ($r in @($rows | Where-Object { $_.state -ceq 'create' -or $_.state -ceq 'update' })) {
            [void]$touched.Add($r); Write-Text $r.path $r.text
            if (-not (Test-SameText (Read-Text $r.path) $r.text)) { throw "Saved content did not match: $($r.path)" }
        }
        # Retire only after every new file is written and verified.
        foreach ($r in @($rows | Where-Object { $_.state -ceq 'retire' })) { [void]$touched.Add($r); Remove-File $r.path }
        $complete = $true
    }
    catch { $message = $_.Exception.Message }
    # finally also runs on Ctrl+C, where catch does not. A killed process skips both; rerunning Install completes it.
    finally {
        if (-not $complete) {
            $errors = @()
            for ($i = $touched.Count - 1; $i -ge 0; $i--) {
                $r = $touched[$i]
                try { if ($null -eq $r.before) { Remove-File $r.path } else { Write-Text $r.path $r.before } } catch { $errors += "$($r.path): $($_.Exception.Message)" }
            }
            $tail = if ($errors.Count) { "Some files could not be restored:`n" + ($errors -join "`n") } else { 'Previously touched files were restored; any backups and empty folders were retained.' }
        }
    }
    if (-not $complete) { throw "File write failed: $message`n$tail" }
    return [pscustomobject]@{ written = @($rows | Where-Object { $_.state -ceq 'create' -or $_.state -ceq 'update' }).Count; backups = $backups
        retired = @($rows | Where-Object { $_.state -ceq 'retire' } | ForEach-Object { $_.path }); kept = @($rows | Where-Object { $_.state -ceq 'retire-conflict' } | ForEach-Object { $_.path }) }
}
function Show-Plan($rows) {
    foreach ($r in $rows) { Write-Host ('{0,-16} {1}' -f $r.state, $r.path) }
    $counts = $rows | Group-Object state | ForEach-Object { "$($_.Count) $($_.Name)" }
    Write-Host ("Review: " + ($counts -join ', '))
    if (@($rows | Where-Object { $_.state -ceq 'retire' }).Count) { Write-Host 'retire: unchanged earlier-version files are backed up, then removed after the new files are verified.' }
    if (@($rows | Where-Object { $_.state -ceq 'retire-conflict' }).Count) { Write-Host 'retire-conflict: edited or unowned earlier-version files are kept. Delete them yourself, or change their name: line to keep a personal copy.' }
    if (@($rows | Where-Object { $_.state -ceq 'conflict' }).Count) { Write-Host 'conflict: these files differ from the installed record and are never overwritten. Restore or move them, then rerun.' -ForegroundColor Yellow }
    if (@($rows | Where-Object { $_.state -ceq 'kept' }).Count) { Write-Host 'kept: the other editor''s agent file is left as it is (-Editor).' }
}
# One line per editor, so a blocked editor is never reported together with one that can be installed.
function Show-EditorPlan($c, $rows) {
    $agents = Get-EditorAgents $c.ide
    $shared = @($rows | Where-Object { $_.state -ceq 'conflict' -and @($agents.Values) -cnotcontains $_.path })
    foreach ($k in $agents.Keys) {
        $r = @($rows | Where-Object { $_.path -ceq $agents[$k] })[0]; $label = Get-EditorLabel $k
        $other = @($agents.Keys | Where-Object { $_ -cne $k })
        $line = if ($r.state -ceq 'kept') { 'left as it is (-Editor)' }
        elseif ($r.state -ceq 'conflict') { "BLOCKED: $($r.path) differs from the installed record (edited), so nothing is written. Restore or move it" + $(if ($other.Count) { ", or rerun with -Editor $($other[0]) to update $(Get-EditorLabel $other[0]) only." } else { '.' }) }
        elseif ($shared.Count) { 'BLOCKED: shared files differ from the installed record (see conflict above).' }
        elseif (@($rows | Where-Object { $_.state -ceq 'conflict' }).Count) { "NOT WRITTEN: its own files are fine, but nothing is written while another editor's agent file is blocked. Rerun with -Editor $k to update $label only." }
        else { "ready ($($r.state)): $($r.path), agent $(Get-EditorAgentName $c $k)" }
        Write-Host "Editor $($label): $line"
    }
}

# ---- Readiness: mirrors readiness() in core.js; test-ps.cjs proves equivalence ----
function Get-Norm([string]$s) { return [regex]::Replace($s, '[ \t\r\n]+', ' ').Trim(' ') }
function Get-Keys($o) { $n = New-Object System.Collections.Generic.List[string]; foreach ($p in $o.PSObject.Properties) { $n.Add($p.Name) }; $k = $n.ToArray(); [array]::Sort($k, [System.StringComparer]::Ordinal); return , $k }
# Canonical JSON identical to canon() in core.js: sorted keys, whitespace runs in text collapsed.
function ConvertTo-Canon($x, [bool]$binaryNumbers = $false) {
    if ($null -eq $x) { return 'null' }
    if ($x -is [string]) { return '"' + (ConvertTo-JsEscaped (Get-Norm $x)) + '"' }
    if ($x -is [bool]) { if ($x) { return 'true' }; return 'false' }
    if (Test-Num $x) {
        $d = [double]$x
        if ($binaryNumbers) {
            if ($d -eq 0) { $d = 0.0 }
            $bytes = [BitConverter]::GetBytes($d)
            if ([BitConverter]::IsLittleEndian) { [array]::Reverse($bytes) }
            return '#' + [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        }
        # Existing approval fingerprints retain their historical numeric formatting.
        if ([math]::Floor($d) -eq $d -and [math]::Abs($d) -lt 1e15) { return ([long]$d).ToString([Globalization.CultureInfo]::InvariantCulture) }
        return $d.ToString('R', [Globalization.CultureInfo]::InvariantCulture)
    }
    if ($x -is [array]) { $p = New-Object System.Collections.Generic.List[string]; foreach ($i in $x) { $p.Add((ConvertTo-Canon $i $binaryNumbers)) }; return '[' + ($p -join ',') + ']' }
    if ($x -is [System.Collections.IDictionary]) { $k = [string[]]@($x.Keys); [array]::Sort($k, [System.StringComparer]::Ordinal); $p = New-Object System.Collections.Generic.List[string]; foreach ($key in $k) { $p.Add('"' + (ConvertTo-JsEscaped $key) + '":' + (ConvertTo-Canon $x[$key] $binaryNumbers)) }; return '{' + ($p -join ',') + '}' }
    if (Test-Obj $x) { $p = New-Object System.Collections.Generic.List[string]; foreach ($key in (Get-Keys $x)) { $p.Add('"' + (ConvertTo-JsEscaped $key) + '":' + (ConvertTo-Canon $x.PSObject.Properties[$key].Value $binaryNumbers)) }; return '{' + ($p -join ',') + '}' }
    return 'null'
}
function Get-Fp($x) { return (Get-TextHash (ConvertTo-Canon $x)).Substring(0, 16) }
# Mirrors reviewSnapshot() in core.js. Workflow-owned mirrors written by SyncPbi (the derived Readiness lines of DRAFT-PBI.md and the
# status/wizard progress of pbi.json) are excluded; $script:LegacyReviewedContent keeps the 5.3 fingerprint for older approvals.
$script:DerivedStatusTail = '. See READINESS.json for the current checker result; prior narrative check counts are historical.'
# -Legacy also computes the 5.3 fingerprint (only needed to check an approval that recorded one).
function Get-ReviewFingerprint([string]$folder, $sourceFiles = $null, [switch]$Legacy) {
    $inputs = New-Map
    $legacyDocs = New-Map
    $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $serializer.MaxJsonLength = [int]::MaxValue
    foreach ($name in @('pbi.json', 'REQUEST.md', 'DRAFT-PBI.md', 'EVIDENCE.md', 'OPEN-QUESTIONS.md', 'DECISION-LOG.md', 'VALIDATION-MATRIX.md')) {
        $full = Get-Full "$folder/$name"
        if ([System.IO.File]::Exists($full)) {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $text = $null
            try { $text = $strictUtf8.GetString($bytes) } catch [System.Text.DecoderFallbackException] { }
            if ($null -ne $text) {
                if ($text.StartsWith([string][char]0xFEFF, [System.StringComparison]::Ordinal)) { $text = $text.Substring(1) }
                $now = $null
                if ($name -ceq 'pbi.json') {
                    try {
                        $parsed = $serializer.DeserializeObject($text); if ($Legacy) { $text = ConvertTo-Canon $parsed $true }
                        if ($parsed -is [System.Collections.IDictionary]) {
                            [void]$parsed.Remove('status')
                            if ($parsed.ContainsKey('wizard') -and ($parsed['wizard'] -is [System.Collections.IDictionary])) { [void]$parsed['wizard'].Remove('step'); [void]$parsed['wizard'].Remove('status') }
                        }
                        $now = ConvertTo-Canon $parsed $true
                    }
                    catch {
                        if (-not ($_.Exception.InnerException -is [System.ArgumentException]) -and -not ($_.Exception.InnerException -is [System.InvalidOperationException])) { throw }
                        $now = $text
                    }
                }
                else {
                    $text = $text.Replace("`r`n", "`n")
                    if ($name -ceq 'DRAFT-PBI.md') { $text = [regex]::Replace($text, '(?m)^Status:.*$', 'Status: <generated-status>') }
                    $now = $text
                    if ($name -ceq 'DRAFT-PBI.md') {
                        $lines = $text.Split([char]10)
                        for ($i = 0; $i -lt $lines.Length; $i++) {
                            $l = $lines[$i]
                            if ($l.StartsWith('Canonical status: ', $Ordinal) -and $l.EndsWith($script:DerivedStatusTail, $Ordinal)) { $lines[$i] = 'Canonical status: <generated-status>.' }
                            elseif ($l.StartsWith('Approvals: {', $Ordinal) -and $l.EndsWith('}', $Ordinal)) { $lines[$i] = 'Approvals: <generated-approvals>' }
                        }
                        $now = [string]::Join("`n", $lines)
                    }
                }
                if ($Legacy) { $legacyDocs[$name] = Get-Hash $Utf8.GetBytes($text) }
                $bytes = $Utf8.GetBytes($now)
            }
            elseif ($Legacy) { $legacyDocs[$name] = Get-Hash $bytes }
            $inputs[$name] = Get-Hash $bytes
        }
    }
    $statePath = "$folder/pbi-state.json"
    $stateRaw = Read-Text $statePath
    $sources = New-Object System.Collections.Generic.List[string]
    if ($null -ne $stateRaw) {
        try {
            $state = $serializer.DeserializeObject($stateRaw)
            if ($state -is [System.Collections.IDictionary]) {
                if ($state['evidence'] -is [array]) {
                    foreach ($e in $state['evidence']) {
                        if ($e -is [System.Collections.IDictionary] -and (Test-Same $e['kind'] 'repo-file') -and (Test-SafePath $e['source']) -and -not $sources.Contains([string]$e['source'])) { $sources.Add([string]$e['source']) }
                    }
                }
                [void]$state.Remove('status'); [void]$state.Remove('approvalHistory')
                if ($state.ContainsKey('analysis') -and ($state['analysis'] -is [System.Collections.IDictionary])) {
                    [void]$state['analysis'].Remove('workflow')
                    if ($state['analysis'].Count -eq 0) { [void]$state.Remove('analysis') }
                }
                $approvals = $state['approvals']
                if ($approvals -is [System.Collections.IDictionary]) { [void]$approvals.Remove('user') }
            }
            $inputs['pbi-state.json'] = Get-TextHash (ConvertTo-Canon $state)
        }
        catch {
            if (-not ($_.Exception.InnerException -is [System.ArgumentException]) -and -not ($_.Exception.InnerException -is [System.InvalidOperationException])) { throw }
            $inputs['pbi-state.json'] = Get-Hash ([System.IO.File]::ReadAllBytes((Get-Full $statePath)))
        }
    }
    if ($sources.Count) {
        $paths = [string[]]$sources.ToArray(); [array]::Sort($paths, [System.StringComparer]::Ordinal)
        $sourceRows = New-Object System.Collections.Generic.List[object]
        foreach ($source in $paths) {
            if ($null -ne $sourceFiles -and $sourceFiles.ContainsKey($source)) { $h = $sourceFiles[$source] }
            else { $full = Get-Full $source; $h = if ([System.IO.File]::Exists($full)) { Get-Hash ([System.IO.File]::ReadAllBytes($full)) } else { $null } }
            $sourceRows.Add(@($source, $h))
        }
        $inputs['evidenceSources'] = $sourceRows.ToArray()
    }
    $attachmentsPath = Get-Full "$folder/attachments"
    if ([System.IO.Directory]::Exists($attachmentsPath)) {
        $names = [string[]]@([System.IO.Directory]::GetFiles($attachmentsPath) | ForEach-Object { [System.IO.Path]::GetFileName($_) })
        [array]::Sort($names, [System.StringComparer]::Ordinal)
        $rows = New-Object System.Collections.Generic.List[object]
        foreach ($name in $names) {
            $bytes = [System.IO.File]::ReadAllBytes((Get-Full "$folder/attachments/$name"))
            $rows.Add(@($name, (Get-Hash $bytes)))
        }
        $inputs['attachments'] = $rows.ToArray()
    }
    $script:LegacyReviewedContent = $null
    if ($Legacy) {
        $legacyInputs = New-Map
        foreach ($k in $inputs.Keys) { $legacyInputs[$k] = $inputs[$k] }
        foreach ($k in $legacyDocs.Keys) { $legacyInputs[$k] = $legacyDocs[$k] }
        $script:LegacyReviewedContent = Get-TextHash (ConvertTo-Canon $legacyInputs)
    }
    return Get-TextHash (ConvertTo-Canon $inputs)
}
function Test-Meaningful($t) { return ($t -is [string]) -and (Get-Norm $t).Length -ge 12 -and -not [regex]::IsMatch($t, '(^|[^A-Za-z0-9])(TBD|TODO|TBC)([^A-Za-z0-9]|$)', 'IgnoreCase, CultureInvariant') }
function Get-DocNorm([string]$s) { return Get-Norm ([regex]::Replace(([regex]::Replace($s, '(?i)<br\s*/?>', ' ')), '[*`]', '')) }
function Test-HasId([string]$doc, [string]$id) { return [regex]::IsMatch($doc, '(^|[^A-Za-z0-9_-])' + [regex]::Escape($id) + '([^A-Za-z0-9_-]|$)') }
function Get-Shown($l) { if ($l -is [string]) { return $l } elseif ($null -eq $l) { return 'null' } elseif ($l -is [bool]) { if ($l) { return 'true' }; return 'false' } elseif (Test-Num $l) { return [string]$l }; return ConvertTo-Json -InputObject $l -Compress -Depth 20 }
function Find-Id($list, $id) { foreach ($x in $list) { if ((Test-Obj $x) -and (Test-Str (Get-Prop $x 'id')) -and (Test-Same $x.id $id)) { return $x } }; return $null }
function Test-BranchProven([string]$app, $evidence, [bool]$scripted, $registration) {
    if ($app -ceq 'cdms' -and $scripted -and -not (Test-Same $registration 'active')) { return $false }
    foreach ($e in $evidence) {
        $system = Get-Prop $e 'system'; $component = Get-Prop $e 'component'
        if ($app -ceq 'ui') { if ((Test-Same $system 'ui') -or (-not (Test-Has $e 'system') -and (Test-In @('javascript', 'web-resource', 'ribbon') $component))) { return $true } }
        elseif ($app -ceq 'cdms') { if (-not (Test-In @('dab', 'ui', 'ocp', 'graphql') $system) -and -not (Test-Same $component 'dab') -and -not ((-not (Test-Has $e 'system')) -and (Test-In @('javascript', 'web-resource', 'ribbon') $component))) { return $true } }
        elseif (-not (Test-In @('legacy-crm', 'cdms', 'ui', 'ocp', 'graphql') $system) -and ((Test-Same $system 'dab') -or -not (Test-In @('cdms-api', 'plugin', 'workflow', 'custom-activity', 'xrm-service', 'javascript', 'web-resource', 'ribbon') $component))) { return $true }
    }
    return $false
}
# Final document keys in core.js order (cdmsRefined, dabRefined, uiRefined).
function Get-FinalKeys { return @($Bundle.readiness.finalDocs.PSObject.Properties | ForEach-Object { $_.Name }) }
function Get-Readiness($state, $docs, [string]$pbi) {
    $Spec = $Bundle.readiness; $S = @($Spec.statuses)
    $issues = New-Object System.Collections.ArrayList; $warnings = New-Object System.Collections.ArrayList
    $add = { param($code, [int]$cap, $ref) [void]$issues.Add([ordered]@{ code = $code; cap = $S[$cap]; ref = [string]$ref; message = [string](Get-Prop $Spec.messages $code) }) }
    $warn = { param($code, $impact, $ref) [void]$warnings.Add([ordered]@{ code = $code; impact = $impact; ref = [string]$ref; message = [string](Get-Prop $Spec.warningMessages $code) }) }
    $isUnverified = { param($x) return (Test-Has $x 'verification') -and -not (Test-Same (Get-Prop $x 'verification') 'VERIFIED') }
    $files = $docs.files
    $fileOf = { param($p) if (($p -is [string]) -and $files.ContainsKey($p)) { $files[$p] } else { $null } }
    $sv = Get-Prop $state 'schemaVersion'
    $valid = (Test-Obj $state) -and (Test-Num $sv) -and ($sv -eq 1 -or $sv -eq 2)
    $review = [ordered]@{}
    if (-not (Test-Obj $state)) { & $add 'STATE_MISSING' 0 $pbi }
    elseif (-not $valid) { & $add 'STATE_SCHEMA' 0 $pbi }
    else {
        if ($sv -eq 1) { & $add 'STATE_OUTDATED' 0 $pbi }
        if (-not (Test-Same (Get-Prop $state 'pbi') $pbi)) { & $add 'STATE_PBI_MISMATCH' 0 $pbi }
        if (-not (Test-In $S (Get-Prop $state 'status'))) { & $add 'STATUS_INVALID' 0 $pbi }
        if ($null -eq $docs.request) { & $add 'REQUEST_MISSING' 0 $pbi }
        $Lists = @{}; foreach ($n in $Spec.lists) { $Lists[$n] = Get-Arr (Get-Prop $state $n) }
        $rules = $Lists['rules']; $acs = $Lists['acceptanceCriteria']; $actors = $Lists['actors']; $evidence = $Lists['evidence']; $decisions = $Lists['decisions']; $deps = $Lists['dependencies']
        if (-not $rules.Count) { & $add 'NO_RULES' 0 $pbi }
        if (-not $acs.Count) { & $add 'NO_ACS' 0 $pbi }
        if (-not $actors.Count) { & $add 'NO_ACTORS' 0 $pbi }
        if (-not ((Get-Prop $state 'dependencies') -is [array])) { & $add 'NO_DEPENDENCIES' 0 $pbi }
        $seen = New-Object System.Collections.Generic.List[string]
        foreach ($n in $Spec.lists) { foreach ($x in $Lists[$n]) { $id = Get-Prop $x 'id'; if (-not (Test-Str $id)) { continue }; if ($seen.Contains($id)) { & $add 'DUPLICATE_ID' 0 $id } else { $seen.Add($id) } } }
        # Files from another PBI's folder are never evidence for this one.
        $isForeign = { param($x) $src = Get-Prop $x 'source'; return ($src -is [string]) -and ($src -cmatch '^(Source/)?playbook/pbis/([^/]+)/') -and -not (Test-Same $Matches[2] $pbi) }
        foreach ($x in $evidence) { if ((Test-Obj $x) -and (& $isForeign $x)) { $id = Get-Prop $x 'id'; & $add 'FOREIGN_PBI_EVIDENCE' 1 $(if (Test-Str $id) { $id } else { $pbi }) } }
        $isHist = { param($x) if ((Get-Prop $x 'historical') -eq $true -and (Get-Prop $x 'historical') -is [bool]) { return $true }; if (& $isForeign $x) { return $true }; $src = Get-Prop $x 'source'; if (-not (Test-Same (Get-Prop $x 'kind') 'repo-file') -or -not ($src -is [string])) { return $false }; foreach ($p in $Spec.historicalPaths) { if ($p.EndsWith('/')) { if ($src.StartsWith($p, [System.StringComparison]::Ordinal)) { return $true } } elseif (Test-Same $src $p) { return $true } }; return $false }
        $evScope = Get-Prop $state 'evidenceScope'; $excluded = @((Get-Arr (Get-Prop $evScope 'exclude')) | Where-Object { $_ -is [string] })
        if ($excluded.Count -and -not (Test-Same (Get-Prop (Find-Id $decisions (Get-Prop $evScope 'decisionRef')) 'status') 'approved')) { & $add 'SCOPE_DECISION_MISSING' 2 $pbi }
        $scope = Get-Prop $state 'paths'; if (-not (Test-Obj $scope)) { $scope = [pscustomobject]@{} }
        $applies = New-Object System.Collections.Generic.List[string]
        $target = if (($docs.application -is [string]) -and (Test-Has $Spec.targetPaths $docs.application)) { @(Get-Prop $Spec.targetPaths $docs.application) } else { $null }
        foreach ($k in $(if ($null -ne $target) { $target } else { $Spec.requiredPaths })) { if (-not (Test-Has $scope $k)) { & $add 'PATH_SCOPE_MISSING' 1 $k } }
        foreach ($k in (Get-Keys $scope)) {
            $v = Get-Prop $scope $k; $ap = Get-Prop $v 'applies'
            if (-not (Test-Obj $v) -or -not ($ap -is [bool]) -or (-not $ap -and -not (Test-Str (Get-Prop $v 'reason')))) { & $add 'PATH_SCOPE_MISSING' 1 $k } elseif ($ap) { $applies.Add($k) }
        }
        if ($null -ne $target) { foreach ($k in $Spec.targetKeys) { if (($target -notcontains $k) -and $applies.Contains($k)) { & $add 'TARGET_SCOPE_CONFLICT' 2 $k } } }
        $ruleIds = @($rules | Where-Object { (Test-Obj $_) -and (Test-Str (Get-Prop $_ 'id')) } | ForEach-Object { $_.id })
        $ruleTexts = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $rules.Count; $i++) {
            $r = $rules[$i]; $rid = Get-Prop $r 'id'; $id = if ((Test-Obj $r) -and (Test-Str $rid)) { $rid } else { "rule $($i + 1)" }
            $owner = Get-Prop $r 'owner'; $cov = Get-Prop $r 'coverage'; $action = Get-Prop $r 'targetAction'
            $badCov = (Test-Has $r 'coverage') -and (-not ($cov -is [array]) -or @($cov | Where-Object { -not (Test-In $Spec.acTypes $_) }).Count)
            if (-not (Test-Obj $r) -or -not (Test-Str $rid) -or -not (Test-Rev (Get-Prop $r 'rev')) -or -not (Test-Str (Get-Prop $r 'context')) -or -not (Test-Obj $owner) -or -not (Test-In $Spec.owners (Get-Prop $owner 'type')) -or -not (Test-In $Spec.actions $action) -or $badCov) { & $add 'RULE_INCOMPLETE' 0 $id; continue }
            $otype = Get-Prop $owner 'type'; $otypes = Get-Prop $owner 'types'
            if ((Test-Same $otype 'multiple') -and (-not ($otypes -is [array]) -or $otypes.Count -lt 2 -or @($otypes | Where-Object { -not (Test-In $Spec.ownerParts $_) }).Count)) { & $add 'RULE_INCOMPLETE' 0 $id; continue }
            if (-not (Test-Meaningful (Get-Prop $r 'rule'))) { & $add 'CONTENT_MISSING' 0 $id }
            $reg = Get-Prop $r 'registration'
            $types = if (Test-Same $otype 'multiple') { $otypes } else { @($otype) }
            $scripted = @($types | Where-Object { Test-In $Spec.scripted $_ }).Count -gt 0
            if ($scripted -and (-not (Test-In $Spec.registration $reg) -or (Test-Same $reg 'unknown'))) { & $add 'REGISTRATION_UNKNOWN' 1 $id }
            $levels = New-Object System.Collections.ArrayList; $comps = New-Object System.Collections.ArrayList
            $hist = $false
            foreach ($e in (Get-Arr (Get-Prop $r 'evidence'))) {
                $x = Find-Id $evidence $e
                if ($null -eq $x) { & $add 'EVIDENCE_UNKNOWN' 1 "$id/$(Get-Shown $e)" } elseif (Test-In $excluded (Get-Prop $x 'system')) { & $add 'EVIDENCE_OUT_OF_SCOPE' 1 "$id/$(Get-Shown $e)" }
                elseif (& $isUnverified $x) { & $warn 'EVIDENCE_NOT_VERIFIED' 'WARNING' "$id/$(Get-Shown $e)" }
                elseif (& $isHist $x) { $hist = $true }
                else { [void]$levels.Add((Get-Prop $x 'level')); if ((Test-Same (Get-Prop $x 'level') 'code') -and (Test-Has $x 'component')) { [void]$comps.Add((Get-Prop $x 'component')) } }
            }
            if (Test-Same $otype 'unknown') { & $add 'OWNER_UNKNOWN' 1 $id } elseif (-not (Test-Same $otype 'none') -and -not (Test-In $levels 'code')) { & $add 'NO_EVIDENCE' 1 $id }
            if ($hist -and -not (Test-In $levels 'code')) { & $add 'HISTORICAL_NOT_PROOF' 1 $id }
            # Only judged when the code evidence names its component, so older states are unaffected.
            if ($comps.Count) { foreach ($t in $types) { if ((Test-In $Spec.attributed $t) -and -not (Test-In $comps $t)) { & $add 'OWNER_MISATTRIBUTED' 1 "$id/$t" } } }
            if ($scripted -and ((Test-Same $reg 'active') -or (Test-Same $reg 'disabled') -or (Test-Same $reg 'missing')) -and -not (Test-In $levels 'registration')) { & $add 'LEVEL_EVIDENCE_MISSING' 1 "$id/registration" }
            if ((Test-Same (Get-Prop $r 'runtime') 'verified') -and -not (Test-In $levels 'runtime')) { & $add 'LEVEL_EVIDENCE_MISSING' 1 "$id/runtime" }
            $paths = Get-Prop $r 'paths'; if (-not (Test-Obj $paths)) { $paths = [pscustomobject]@{} }
            foreach ($k in $applies) { if (-not (Test-Has $paths $k)) { & $add 'PATH_UNKNOWN' 1 "$id/$k" } }
            foreach ($k in (Get-Keys $paths)) {
                $p = Get-Prop $paths $k; $st = Get-Prop $p 'status'
                if (-not $applies.Contains($k)) { if ((Test-Same $st 'reaches') -or (Test-Same $st 'bypasses')) { & $add 'PATH_CONFLICT' 1 "$id/$k" }; continue }
                if (-not (Test-In $Spec.pathStatus $st) -or (Test-Same $st 'unknown') -or ((Test-Same $st 'not-applicable') -and -not (Test-Str (Get-Prop $p 'reason')))) { & $add 'PATH_UNKNOWN' 1 "$id/$k"; continue }
                if (Test-Same $st 'not-applicable') { continue }
                $reach = $false
                foreach ($e in (Get-Arr (Get-Prop $p 'evidence'))) {
                    $x = Find-Id $evidence $e
                    if ($null -eq $x) { & $add 'EVIDENCE_UNKNOWN' 1 "$id/$k/$(Get-Shown $e)" }
                    elseif (Test-In $excluded (Get-Prop $x 'system')) { & $add 'EVIDENCE_OUT_OF_SCOPE' 1 "$id/$k/$(Get-Shown $e)" }
                    elseif ((Test-Same (Get-Prop $x 'system') 'legacy-crm') -and -not (Test-Same $k 'cdms')) { & $add 'LEGACY_NOT_TARGET_EVIDENCE' 1 "$id/$k/$(Get-Shown $e)" }
                    elseif ((Test-Same (Get-Prop $x 'level') 'reach') -and -not (& $isHist $x) -and -not (& $isUnverified $x)) { $reach = $true }
                }
                if (-not $reach) { & $add 'LEVEL_EVIDENCE_MISSING' 1 "$id/$k" }
            }
            $openGaps = @((Get-Arr (Get-Prop $r 'gaps')) | Where-Object { -not (Test-Obj $_) -or -not (Test-Same (Get-Prop $_ 'status') 'resolved') })
            $isRelaxed = { param($g) return (Test-Obj $g) -and ((Test-Same (Get-Prop $g 'impact') 'WARNING') -or (Test-Same (Get-Prop $g 'impact') 'INFORMATIONAL')) }
            if ((Test-Same $action 'resolve-gap') -or @($openGaps | Where-Object { -not (& $isRelaxed $_) }).Count) { & $add 'EVIDENCE_GAP' 1 $id }
            foreach ($g in $openGaps) { if (& $isRelaxed $g) { $gid = Get-Prop $g 'id'; & $warn 'GAP_OPEN' (Get-Prop $g 'impact') "$id$(if (Test-Str $gid) { "/$gid" })" } }
            $bypass = $false; foreach ($k in $applies) { $p = Get-Prop $paths $k; if ((-not (Test-Same $k 'dab') -or -not (Test-Has $r 'dab')) -and (Test-Has $paths $k) -and (Test-Obj $p) -and (Test-Same (Get-Prop $p 'status') 'bypasses')) { $bypass = $true } }
            if ((Test-Same $action 'reuse') -and (($scripted -and ((Test-Same $reg 'disabled') -or (Test-Same $reg 'missing'))) -or $bypass)) { & $add 'REUSE_NOT_ENFORCED' 1 $id }
            if (Test-Has $r 'dab') {
                $b = Get-Prop $r 'dab'; $layer = Get-Prop $b 'layer'; $bst = Get-Prop $b 'status'
                if ((Test-Obj $b) -and ($layer -is [string]) -and $layer -match '(?i)plugin') { & $add 'DAB_PLUGIN_ASSIGNED' 1 $id }
                elseif (-not (Test-Obj $b) -or -not (Test-In $Spec.dabStatus $bst) -or $(if (Test-Same $bst 'not-applicable') { -not (Test-Str (Get-Prop $b 'reason')) } else { -not (Test-In $Spec.dabLayers $layer) })) { & $add 'DAB_OWNER_INVALID' 1 $id }
            }
            if (Test-Has $r 'branches') {
                # Every material branch is tracked separately: one covered branch never covers the rule.
                $apps = @($Spec.branchApps | Where-Object { $applies.Contains($_) })
                $bad = New-Object System.Collections.Generic.List[string]; $open = New-Object System.Collections.Generic.List[string]; $bids = New-Object System.Collections.Generic.List[string]
                $brs = Get-Prop $r 'branches'
                if (-not ($brs -is [array]) -or $brs.Count -eq 0) { $bad.Add($id) }
                else {
                    foreach ($b in $brs) {
                        $bidv = Get-Prop $b 'id'; $bid = if ((Test-Obj $b) -and (Test-Str $bidv)) { $bidv } else { "$id/branch" }
                        $broken = -not (Test-Obj $b) -or -not (Test-Str $bidv)
                        if (-not $broken) {
                            $broken = $bids.Contains($bidv) -or -not (Test-Str (Get-Prop $b 'condition')) -or -not (Test-Str (Get-Prop $b 'expected'))
                            foreach ($k in $apps) { if (-not (Test-In $Spec.branchCoverage (Get-Prop $b $k))) { $broken = $true } }
                            $conf = $false; foreach ($k in $apps) { if (Test-Same (Get-Prop $b $k) 'conflicting') { $conf = $true } }
                            if ($conf -and -not (Test-Str (Get-Prop $b 'risk'))) { $broken = $true }
                            $acc = Get-Arr (Get-Prop $b 'acceptance'); if ($acc.Count -eq 0) { $broken = $true }
                            foreach ($a in $acc) { $hit = $false; foreach ($x in $acs) { if ((Test-Obj $x) -and (Test-Same (Get-Prop $x 'id') $a) -and (Test-In (Get-Arr (Get-Prop $x 'rules')) $rid)) { $hit = $true } }; if (-not $hit) { $broken = $true } }
                        }
                        if ($broken) { $bad.Add($bid); continue }
                        $bids.Add($bidv)
                        $ev = @(); $branchRefs = New-Object System.Collections.ArrayList
                        foreach ($e in (Get-Arr (Get-Prop $b 'evidence'))) {
                            if ($branchRefs.Contains($e)) { continue }; [void]$branchRefs.Add($e)
                            $x = Find-Id $evidence $e
                            if ($null -eq $x) { & $add 'EVIDENCE_UNKNOWN' 1 "$bidv/$(Get-Shown $e)"; continue }
                            if ((Test-In $excluded (Get-Prop $x 'system')) -or (& $isHist $x) -or (& $isUnverified $x) -or -not (Test-Same (Get-Prop $x 'level') 'code') -or ((Get-Prop $x 'stale') -is [bool] -and (Get-Prop $x 'stale'))) { continue }
                            $kind = Get-Prop $x 'kind'
                            if (Test-Same $kind 'repo-file') { $h = & $fileOf (Get-Prop $x 'source'); $recorded = Get-Prop $x 'sha256'; if ($null -eq $h -or (($recorded -is [string]) -and -not (Test-Same $recorded.ToLowerInvariant() $h))) { continue } }
                            if ((Test-Same $kind 'external') -and -not (Test-Str (Get-Prop $x 'revision'))) { continue }
                            $ev += , $x
                        }
                        foreach ($k in $apps) { if ((Test-Same (Get-Prop $b $k) 'covered') -and -not (Test-BranchProven $k $ev $scripted $reg)) { & $add 'BRANCH_COVERAGE_UNPROVEN' 1 "$bidv/$k" } }
                        foreach ($k in $apps) { $cv = Get-Prop $b $k; if (-not (Test-Same $cv 'covered') -and -not (Test-Same $cv 'not-applicable')) { $key = "${k}:$bidv"; if (-not $open.Contains($key)) { $open.Add($key) } } }
                    }
                }
                foreach ($x in $bad) { & $add 'BRANCH_INCOMPLETE' 0 $x }
                $hasDab = Test-Has $r 'dab'
                if (Test-Same $action 'reuse') { foreach ($x in $open) { $k = $x.Substring(0, $x.IndexOf(':')); if ((Test-Same $k 'cdms') -or (Test-Same $k 'ui') -or -not $hasDab) { & $add 'BRANCH_NOT_COVERED' 1 ($x.Substring($x.IndexOf(':') + 1) + '/' + $k) } } }
                $dabv = Get-Prop $r 'dab'
                if ((Test-Obj $dabv) -and (Test-Same (Get-Prop $dabv 'status') 'implemented')) { foreach ($x in $open) { if ($x.StartsWith('dab:', [System.StringComparison]::Ordinal)) { & $add 'DAB_BRANCH_GAP' 1 $x.Substring(4) } } }
            }
            $rt = Get-Prop $r 'rule'
            if (Test-Str $rt) { $t = Get-Norm $rt; if ($ruleTexts.Contains($t)) { & $add 'RULE_DUPLICATE' 3 $id } else { $ruleTexts.Add($t) } }
            foreach ($d in (Get-Arr (Get-Prop $r 'dependencies'))) { if ($null -eq (Find-Id $deps $d)) { & $add 'DEPENDENCY_UNKNOWN' 0 "$id/$(Get-Shown $d)" } }
            $d = Find-Id $decisions (Get-Prop $r 'decisionRef')
            if (-not (Test-Same (Get-Prop $r 'decision') 'confirmed') -or $null -eq $d -or -not (Test-Same (Get-Prop $d 'status') 'approved')) { & $add 'DECISION_PENDING' 2 $id }
            $need = if ($cov -is [array] -and $cov.Count) { $cov } else { @('positive', 'negative') }
            foreach ($t in $need) {
                $hit = $false
                foreach ($a in $acs) { if ((Test-Obj $a) -and (Test-In (Get-Arr (Get-Prop $a 'rules')) $rid) -and (Test-Same (Get-Prop $a 'type') $t)) { $hit = $true; break } }
                if (-not $hit) { & $add 'MISSING_COVERAGE' 0 "$id/$t" }
            }
        }
        for ($i = 0; $i -lt $acs.Count; $i++) {
            $a = $acs[$i]; $aid = Get-Prop $a 'id'; $id = if ((Test-Obj $a) -and (Test-Str $aid)) { $aid } else { "criterion $($i + 1)" }
            $links = Get-Arr (Get-Prop $a 'rules')
            if (-not (Test-Obj $a) -or -not (Test-Str $aid) -or -not (Test-Rev (Get-Prop $a 'rev')) -or -not (Test-In $Spec.acTypes (Get-Prop $a 'type')) -or -not $links.Count) { & $add 'AC_INCOMPLETE' 0 $id; continue }
            if (-not (Test-Meaningful (Get-Prop $a 'criterion'))) { & $add 'CONTENT_MISSING' 0 $id }
            foreach ($l in $links) { if (-not (Test-In $ruleIds $l)) { & $add 'AC_UNKNOWN_RULE' 0 "$id/$(Get-Shown $l)" } }
        }
        for ($i = 0; $i -lt $evidence.Count; $i++) {
            $e = $evidence[$i]; $eid = Get-Prop $e 'id'; $id = if ((Test-Obj $e) -and (Test-Str $eid)) { $eid } else { "evidence $($i + 1)" }
            $kind = Get-Prop $e 'kind'; $src = Get-Prop $e 'source'
            if (-not (Test-Obj $e) -or -not (Test-Str $eid) -or -not (Test-In $Spec.evidenceLevels (Get-Prop $e 'level')) -or -not (Test-In $Spec.evidenceKinds $kind) -or -not (Test-Str $src) -or -not (Test-Str (Get-Prop $e 'location')) -or -not (Test-Str (Get-Prop $e 'summary')) -or ((Test-Has $e 'system') -and -not (Test-In $Spec.evidenceSystems (Get-Prop $e 'system'))) -or ((Test-Has $e 'component') -and -not (Test-In $Spec.evidenceComponents (Get-Prop $e 'component'))) -or ((Test-Has $e 'verification') -and -not (Test-In $Spec.verification (Get-Prop $e 'verification'))) -or ((Test-Same $kind 'repo-file') -and -not (Test-SafePath $src)) -or ((Test-Same $kind 'external') -and -not (Test-Str (Get-Prop $e 'revision')))) { & $add 'EVIDENCE_INCOMPLETE' 1 $id; continue }
            $stale = Get-Prop $e 'stale'; if (($stale -is [bool]) -and $stale) { & $add 'EVIDENCE_STALE' 1 $id }
            if (Test-Same $kind 'repo-file') {
                $h = & $fileOf $src; $recorded = Get-Prop $e 'sha256'
                if ($null -eq $h) { & $add 'EVIDENCE_SOURCE_MISSING' 1 $id } elseif (($recorded -is [string]) -and -not (Test-Same $recorded.ToLowerInvariant() $h)) { & $add 'EVIDENCE_CHANGED' 1 $id }
            }
        }
        for ($i = 0; $i -lt $actors.Count; $i++) {
            $a = $actors[$i]; $id = if ((Test-Obj $a) -and (Test-Str (Get-Prop $a 'id'))) { $a.id } else { "actor $($i + 1)" }
            if (-not (Test-Obj $a) -or -not (Test-Str (Get-Prop $a 'role')) -or -not (Test-Str (Get-Prop $a 'unauthorizedBehavior')) -or -not (Test-In $Spec.identities (Get-Prop $a 'identity'))) { & $add 'ACTOR_INCOMPLETE' 0 $id }
            elseif (Test-Same $a.identity 'unknown') { & $add 'IDENTITY_UNKNOWN' 1 $id }
        }
        $qs = $Lists['questions']
        $asked = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $qs.Count; $i++) {
            $q = $qs[$i]; $qst = Get-Prop $q 'status'
            if (-not (Test-Obj $q) -or (Test-Same $qst 'superseded')) { continue }
            $id = if (Test-Str (Get-Prop $q 'id')) { $q.id } else { "question $($i + 1)" }; $cap = if (Test-Same (Get-Prop $q 'owner') 'technical') { 1 } else { 2 }
            $qt = Get-Prop $q 'question'
            if (Test-Str $qt) { $t = Get-Norm $qt; if ($asked.Contains($t)) { & $add 'QUESTION_DUPLICATE' 3 $id } else { $asked.Add($t) } }
            $b = Get-Prop $q 'blocking'
            if (-not ($b -is [bool]) -or -not $b) { continue }
            if (-not (Test-In $Spec.questionResolved $qst)) { & $add 'BLOCKING_QUESTION' $cap $id }
            elseif (-not (Test-Str (Get-Prop $q 'resolution')) -or ($cap -eq 2 -and -not (Test-Same $qst 'not-applicable') -and -not (Test-Same (Get-Prop (Find-Id $decisions (Get-Prop $q 'decisionRef')) 'status') 'approved'))) { & $add 'QUESTION_UNSUPPORTED' $cap $id }
        }
        $as = $Lists['assumptions']
        for ($i = 0; $i -lt $as.Count; $i++) {
            $a = $as[$i]; $c = Get-Prop $a 'changesBehavior'
            if ((Test-Obj $a) -and ($c -is [bool]) -and $c -and -not (Test-Same (Get-Prop $a 'status') 'resolved')) { & $add 'OPEN_ASSUMPTION' 2 $(if (Test-Str (Get-Prop $a 'id')) { $a.id } else { "assumption $($i + 1)" }) }
        }
        for ($i = 0; $i -lt $decisions.Count; $i++) {
            $d = $decisions[$i]; if (-not (Test-Obj $d)) { continue }
            $id = if (Test-Str (Get-Prop $d 'id')) { $d.id } else { "decision $($i + 1)" }
            if (-not (Test-Same (Get-Prop $d 'pbi') $pbi)) { & $add 'FOREIGN_DECISION' 2 $id }
            if ((Test-Same (Get-Prop $d 'status') 'approved') -and -not (Test-Str (Get-Prop $d 'evidence'))) { & $add 'DECISION_NO_EVIDENCE' 2 $id }
            if (Test-Same (Get-Prop $d 'status') 'proposed') { & $add 'DECISION_PROPOSED' 2 $id }
            $sup = Get-Prop $d 'supersedes'
            if ((Test-Str $sup) -and -not (Test-Same (Get-Prop (Find-Id $decisions $sup) 'status') 'superseded')) { & $add 'DECISION_SUPERSEDES_INVALID' 2 $id }
            if ((Test-Str (Get-Prop $d 'id')) -and (($null -eq $docs.decisionLog) -or -not (Test-HasId $docs.decisionLog $d.id))) { & $add 'DECISION_NOT_LOGGED' 3 $id }
        }
        for ($i = 0; $i -lt $deps.Count; $i++) {
            $d = $deps[$i]
            if (-not (Test-Obj $d) -or -not (Test-Str (Get-Prop $d 'id')) -or -not (Test-Str (Get-Prop $d 'repository')) -or -not (Test-Str (Get-Prop $d 'responsibility'))) { & $add 'DEPENDENCY_INCOMPLETE' 0 $(if ((Test-Obj $d) -and (Test-Str (Get-Prop $d 'id'))) { $d.id } else { "dependency $($i + 1)" }) }
        }
        $f = Get-Prop $state 'feasibility'
        if (-not (Test-Obj $f) -or -not (Test-Same (Get-Prop $f 'status') 'reviewed') -or -not (Test-Str (Get-Prop $f 'evidence'))) { & $add 'FEASIBILITY_PENDING' 1 $pbi }
        # Approval basis: a fingerprint per record in each scope; local evidence files are bound by their content hash.
        $part = @{}
        foreach ($n in $Spec.lists) {
            $list = New-Object System.Collections.ArrayList; $items = $Lists[$n]
            for ($i = 0; $i -lt $items.Count; $i++) {
                $x = $items[$i]; $key = if ((Test-Obj $x) -and (Test-Str (Get-Prop $x 'id'))) { $x.id } else { $n + '[' + $i + ']' }
                $target = $x
                if ($n -ceq 'evidence') { $target = New-Map; $target['record'] = $x; $target['file'] = $(if ((Test-Obj $x) -and (Test-Same (Get-Prop $x 'kind') 'repo-file')) { & $fileOf (Get-Prop $x 'source') } else { $null }) }
                [void]$list.Add(@($key, (Get-Fp $target)))
            }
            $part[$n] = $list
        }
        foreach ($n in @('paths', 'feasibility')) { $part[$n] = @(, @($n, (Get-Fp (Get-Prop $state $n)))) }
        # Only fingerprinted when recorded, so approvals given before 4.0 stay valid.
        # Assigned inside the branches: an if-expression would unroll the one-pair array.
        if (Test-Has $state 'evidenceScope') { $part['evidenceScope'] = @(, @('evidenceScope', (Get-Fp (Get-Prop $state 'evidenceScope')))) } else { $part['evidenceScope'] = @() }
        if (Test-Str $docs['reviewedContent']) { $part['reviewedContent'] = @(, @('reviewedContent', $docs['reviewedContent'])) } else { $part['reviewedContent'] = @() }
        foreach ($k in $Spec.approvals) {
            $m = New-Map; foreach ($n in $Spec.scopes.$k) { foreach ($pair in $part[$n]) { $m[$pair[0]] = $pair[1] } }
            $keys = [string[]]@($m.Keys); [array]::Sort($keys, [System.StringComparer]::Ordinal)
            $basis = New-Map; foreach ($key in $keys) { $basis[$key] = $m[$key] }
            $review[$k] = [ordered]@{ fingerprint = (Get-Fp $basis); basis = $basis }
        }
        foreach ($k in $Spec.approvals) {
            $a = Get-Prop (Get-Prop $state 'approvals') $k
            if (-not (Test-Obj $a) -or -not (Test-Same (Get-Prop $a 'status') 'approved') -or -not (Test-Str (Get-Prop $a 'by')) -or -not (Test-Str (Get-Prop $a 'at')) -or -not (Test-Str (Get-Prop $a 'evidence'))) { if (@($Spec.requiredApprovals) -contains $k) { & $add 'APPROVAL_PENDING' 3 $k }; continue }
            $b = Get-Prop $a 'basis'; $bad = -not (Test-Obj $b) -or -not @($b.PSObject.Properties).Count
            if (-not $bad) { foreach ($p in $b.PSObject.Properties) { $pattern = if ($p.Name -ceq 'reviewedContent') { '\A[0-9a-f]{64}\z' } else { '\A[0-9a-f]{16}\z' }; if (-not ($p.Value -is [string]) -or $p.Value -cnotmatch $pattern) { $bad = $true } } }
            if ($bad) { & $add 'APPROVAL_UNBOUND' 3 $k; continue }
            $cur = $review[$k].basis
            if ($k -ceq 'user' -and -not (Test-Has $b 'reviewedContent')) { $legacy = New-Map; foreach ($key in $cur.Keys) { if ($key -cne 'reviewedContent') { $legacy[$key] = $cur[$key] } }; $cur = $legacy }
            # An approval recorded before 5.4 is bound to the 5.3 fingerprint; it stays current while that content is unchanged (as in core.js).
            if ($k -ceq 'user' -and (Test-Has $b 'reviewedContent') -and $cur.ContainsKey('reviewedContent') -and -not (Test-Same (Get-Prop $b 'reviewedContent') $cur['reviewedContent']) -and (Test-Str $docs['legacyReviewedContent']) -and (Test-Same (Get-Prop $b 'reviewedContent') $docs['legacyReviewedContent'])) {
                $kept = New-Map; foreach ($key in $cur.Keys) { $kept[$key] = $cur[$key] }; $kept['reviewedContent'] = Get-Prop $b 'reviewedContent'; $cur = $kept
            }
            $changed = New-Object System.Collections.Generic.List[string]; $added = New-Object System.Collections.Generic.List[string]; $removed = New-Object System.Collections.Generic.List[string]
            foreach ($key in $cur.Keys) { if (-not (Test-Has $b $key)) { $added.Add($key) } elseif (-not (Test-Same (Get-Prop $b $key) $cur[$key])) { $changed.Add($key) } }
            foreach ($key in (Get-Keys $b)) { if (-not $cur.ContainsKey($key)) { $removed.Add($key) } }
            $diff = @(); foreach ($w in @(@('changed', $changed), @('added', $added), @('removed', $removed))) { if ($w[1].Count) { $diff += $w[0] + ' ' + ($w[1] -join ', ') } }
            if ($diff.Count) { & $add 'APPROVAL_STALE' 3 ("${k}: " + ($diff -join '; ')) }
        }
        # $pre names an application-specific final document in the issue reference.
        $checkDoc = {
            param($doc, $pre)
            $m = [regex]::Match($doc, '(?m)^Status:\s*(.+?)\s*$')
            if (-not $m.Success -or -not (Test-Same $m.Groups[1].Value (Get-Prop $state 'status'))) { & $add 'DOC_STATUS_MISMATCH' 3 ($pre + $(if ($m.Success) { $m.Groups[1].Value } else { '(no Status line)' })) }
            $n = Get-DocNorm $doc; $done = New-Object System.Collections.Generic.List[string]
            $pairs = @(); foreach ($x in $rules) { $pairs += , @($x, (Get-Prop $x 'rule')) }; foreach ($x in $acs) { $pairs += , @($x, (Get-Prop $x 'criterion')) }; foreach ($x in $deps) { $pairs += , @($x, $null) }
            foreach ($pair in $pairs) {
                $x = $pair[0]; $xid = Get-Prop $x 'id'
                if (-not (Test-Obj $x) -or -not (Test-Str $xid) -or $done.Contains($xid)) { continue }; $done.Add($xid)
                if (-not (Test-HasId $doc $xid)) { & $add 'DOC_MISSING_ID' 3 ($pre + $xid) }
                elseif ((Test-Meaningful $pair[1]) -and -not $n.Contains((Get-DocNorm $pair[1]))) { & $add 'DOC_CONTENT_MISMATCH' 3 ($pre + $xid) }
            }
        }
        $doc = if ($null -ne $docs.refined) { $docs.refined } else { $docs.draft }
        if ($null -eq $doc) { & $add 'DOC_MISSING' 0 $pbi } else { & $checkDoc $doc '' }
        foreach ($key in (Get-FinalKeys)) {
            $fd = Get-Prop $Spec.finalDocs $key
            if ($null -ne $docs[$key]) { if (-not $applies.Contains($fd[0])) { & $add 'DOC_OUT_OF_SCOPE' 3 $fd[1] }; & $checkDoc $docs[$key] ($fd[1] + '/') }
        }
    }
    $capOf = { $c = 4; foreach ($x in $issues) { $j = [array]::IndexOf($S, $x.cap); if ($j -lt $c) { $c = $j } }; $c }
    if ($valid -and (& $capOf) -lt 4) {
        if ($null -ne $docs.refined) { & $add 'FINAL_WITHOUT_APPROVAL' 3 $pbi }
        foreach ($key in (Get-FinalKeys)) { if ($null -ne $docs[$key]) { & $add 'FINAL_WITHOUT_APPROVAL' 3 (Get-Prop $Spec.finalDocs $key)[1] } }
    }
    $claimed = if ($valid -and (Test-In $S (Get-Prop $state 'status'))) { $state.status } else { '' }
    if ($claimed -and [array]::IndexOf($S, $claimed) -gt (& $capOf)) { & $add 'STATUS_OVERCLAIMED' 3 $claimed }
    $computed = $S[(& $capOf)]
    return [ordered]@{ schemaVersion = 2; pbi = $pbi; claimedStatus = $claimed; computedStatus = $computed; finalAllowed = ($computed -ceq 'Development-Ready'); issues = @($issues); warnings = @($warnings); review = $review; reviewedContent = $docs['reviewedContent'] }
}
# The development target of a 5.0 intake (pbi.json with repositories); 4.x PBIs keep the 4.x path rules (same as applicationOf in core.js).
function Get-Application([string]$folder) {
    $raw = Read-Text "$folder/pbi.json"; if ($null -eq $raw) { return $null }
    try { $p = $raw | ConvertFrom-Json } catch { return $null }
    # Read the property directly: a function return would unroll an empty array to `$null.
    $a = Get-Prop $p 'application'; $repos = if (Test-Obj $p) { $p.PSObject.Properties['repositories'] } else { $null }
    if (($a -is [string]) -and $null -ne $repos -and (($repos.Value -is [array]) -or (Test-Obj $repos.Value))) {
        # A key, or a label saved by an earlier version (targetKey in core.js).
        foreach ($t in $Bundle.targets.PSObject.Properties) { if ((Test-Same $t.Name $a) -or (Test-Same ([string]$t.Value.label) $a)) { return $t.Name } }
        return $a
    }; return $null
}
function New-DocxBytes([string]$markdown) {
    Add-Type -AssemblyName System.IO.Compression
    $stream = New-Object System.IO.MemoryStream
    $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $entries = [ordered]@{
        '[Content_Types].xml' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
        '_rels/.rels' = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    }
    $body = New-Object System.Text.StringBuilder
    foreach ($line in ($markdown -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $text = $line
        if ($line -match '^\s*[-*]\s+(.*)$') { $text = ([string][char]0x2022) + ' ' + $Matches[1] }
        elseif ($line -match '^#{1,3}\s+(.*)$') { $text = $Matches[1] }
        $escaped = [System.Security.SecurityElement]::Escape($text)
        [void]$body.Append('<w:p><w:r><w:t xml:space="preserve">').Append($escaped).Append('</w:t></w:r></w:p>')
    }
    $entries['word/document.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + $body.ToString() + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>'
    foreach ($pair in $entries.GetEnumerator()) {
        $entry = $archive.CreateEntry($pair.Key, [System.IO.Compression.CompressionLevel]::NoCompression)
        $writer = New-Object System.IO.StreamWriter($entry.Open(), $utf8)
        try { $writer.Write([string]$pair.Value) } finally { $writer.Dispose() }
    }
    $archive.Dispose()
    $bytes = $stream.ToArray()
    $stream.Dispose()
    return ,$bytes
}
# The Refined PBI documents of the development target whose path applies (finalDocumentNames in core.js).
function Get-FinalDocumentNames($folder, $state) {
    $application = Get-Application $folder; $areas = Get-TargetAreas $application
    # One Refined PBI per selected area whose path applies; an area that is not selected never gets one.
    $documents = if ($areas.Count) { @($areas | ForEach-Object { @{ cdms = 'Refined-PBI-CDMS.md'; dab = 'Refined-PBI-DAB.md'; ui = 'Refined-PBI-UI.md' }[$_] }) } else { @('REFINED-PBI.md') }
    if ($areas.Count) {
        $paths = Get-Prop $state 'paths'
        $documents = @($documents | Where-Object {
            $key = switch ($_) { 'Refined-PBI-CDMS.md' {'cdms'} 'Refined-PBI-DAB.md' {'dab'} 'Refined-PBI-UI.md' {'ui'} }
            (Get-Prop (Get-Prop $paths $key) 'applies') -eq $true
        })
    }
    return ,$documents
}
# Every final file (.md, .json, .docx) exists under its current or an earlier name (finalArtifacts in core.js): required for COMPLETE.
function Test-FinalArtifacts($folder, $state) {
    $earlier = @{ 'Refined-PBI-CDMS.md' = @('PBI-CDMS.md', 'CDMS-REFINED-PBI.md'); 'Refined-PBI-DAB.md' = @('PBI-DAB.md', 'DAB-REFINED-PBI.md'); 'Refined-PBI-UI.md' = @('PBI-UI.md') }
    $names = Get-FinalDocumentNames $folder $state
    if (-not $names.Count) { return $false }
    foreach ($name in $names) {
        $found = $false
        foreach ($n in @(@($name) + @($earlier[$name]))) {
            if (-not $n) { continue }
            $base = $n.Substring(0, $n.Length - 3); $all = $true
            foreach ($ext in @('.md', '.json', '.docx')) { if (-not [System.IO.File]::Exists((Get-Full "$folder/$base$ext"))) { $all = $false; break } }
            if ($all) { $found = $true; break }
        }
        if (-not $found) { return $false }
    }
    return $true
}
# The stage shown to the user (refinementPhase in core.js).
function Get-RefinementPhase($folder, $state, $gate, $report) {
    if (-not $gate.canContinue) { return 'Questions' }
    if ($gate.canRefine) { if (Test-FinalArtifacts $folder $state) { return 'COMPLETE' } else { return 'Refined PBI' } }
    # The report is a dictionary when just computed and an object when reused from READINESS.json; both have these keys.
    if (Test-Same $report.computedStatus 'Ready for Review') { return 'Approval' }
    return 'Refinement Review'
}
function Get-ChatFinalDocuments($folder, $state, $request) {
    $application = Get-Application $folder
    $documents = Get-FinalDocumentNames $folder $state; $paths = Get-Prop $state 'paths'
    if (-not $documents.Count) { throw "No final PBI applies to $application; review the target paths." }
    $rules = Get-Arr (Get-Prop $state 'rules')
    $criteria = Get-Arr (Get-Prop $state 'acceptanceCriteria')
    $dependencies = Get-Arr (Get-Prop $state 'dependencies')
    $decisions = Get-Arr (Get-Prop $state 'decisions')
    $questions = Get-Arr (Get-Prop $state 'questions')
    $assumptions = Get-Arr (Get-Prop $state 'assumptions')
    $evidence = Get-Arr (Get-Prop $state 'evidence')
    $results = @()
    foreach ($name in $documents) {
        $documentKey = switch ($name) { 'Refined-PBI-CDMS.md' {'cdms'} 'Refined-PBI-DAB.md' {'dab'} 'Refined-PBI-UI.md' {'ui'} default {$null} }
        $ownKeys = if ($application -eq 'both' -or $documents.Count -gt 1) { @($documentKey) } else { Get-TargetAreas $application }
        $ownRules = @($rules | Where-Object {
            $rule = $_
            @($ownKeys | Where-Object {
                $branch = Get-Prop (Get-Prop $rule 'paths') $_
                (Get-Prop (Get-Prop (Get-Prop $state 'paths') $_) 'applies') -eq $true -and
                    $null -ne $branch -and (Get-Prop $branch 'status') -ne 'not-applicable'
            }).Count -gt 0
        })
        $ownIds = @($ownRules | ForEach-Object { Get-Prop $_ 'id' })
        $ownCriteria = @($criteria | Where-Object {
            $criterionRules = Get-Arr (Get-Prop $_ 'rules')
            @($criterionRules | Where-Object { $ownIds -contains $_ }).Count -gt 0
        })
        $relatedRules = @($rules | Where-Object { $ownIds -notcontains (Get-Prop $_ 'id') })
        $relatedCriteria = @($criteria | Where-Object { $ownCriteria -notcontains $_ })
        $citedIds = New-Object 'System.Collections.Generic.List[string]'
        foreach ($rule in $ownRules) {
            foreach ($id in (Get-Arr (Get-Prop $rule 'evidence'))) { if (-not $citedIds.Contains([string]$id)) { $citedIds.Add([string]$id) } }
            $rulePaths = Get-Prop $rule 'paths'
            if (Test-Obj $rulePaths) {
                foreach ($path in $rulePaths.PSObject.Properties) {
                    foreach ($id in (Get-Arr (Get-Prop $path.Value 'evidence'))) { if (-not $citedIds.Contains([string]$id)) { $citedIds.Add([string]$id) } }
                }
            }
            foreach ($branch in (Get-Arr (Get-Prop $rule 'branches'))) {
                foreach ($id in (Get-Arr (Get-Prop $branch 'evidence'))) { if (-not $citedIds.Contains([string]$id)) { $citedIds.Add([string]$id) } }
            }
        }
        $citedEvidence = @($evidence | Where-Object { $citedIds -contains [string](Get-Prop $_ 'id') })
        $lines = New-Object 'System.Collections.Generic.List[string]'
        $title = Get-Prop $request 'title'; if (-not (Test-Str $title)) { $title = Get-Prop $state 'pbi' }
        $number = Get-Prop $request 'number'; if (-not (Test-Str $number)) { $number = 'Not created' }
        $label = switch ($name) { 'Refined-PBI-CDMS.md' {'Refined PBI: CDMS backend'} 'Refined-PBI-DAB.md' {'Refined PBI: DAB backend'} 'Refined-PBI-UI.md' {'Refined PBI: Shared Angular UI'} default {'Refined PBI'} }
        $dash = [string][char]0x2014 # the em dash, as a code point: Windows PowerShell 5.1 reads this BOM-less script as ANSI
        $lines.Add('# ' + $title + ' ' + $dash + ' ' + $label); $lines.Add(''); $lines.Add('Status: Development-Ready'); $lines.Add('')
        $lines.Add('- PBI number: ' + $number + '. Local draft identifier: ' + (Get-Prop $state 'pbi') + '.')
        $targetInfo = Get-Prop $Bundle.targets ([string]$application)
        $lines.Add('- Development target: ' + $(if ($null -ne $targetInfo) { [string]$targetInfo.label } else { 'Not recorded' })); $lines.Add('')
        $lines.Add('## Description'); $lines.Add(''); $description = Get-Prop $request 'description'; if (-not (Test-Str $description)) { $description = 'See REQUEST.md.' }; $lines.Add($description); $lines.Add('')
        $lines.Add('## Original acceptance criteria (as submitted)'); $lines.Add('')
        $originalCriteria = Get-Prop $request 'acceptanceCriteria'; if (Test-Str $originalCriteria) { $lines.Add($originalCriteria) } else { $lines.Add('None entered; see Acceptance criteria.') }; $lines.Add('')
        $lines.Add('## Business requirements'); $lines.Add('')
        foreach ($rule in $ownRules) {
            $id = Get-Prop $rule 'id'; if (-not (Test-Str $id)) { continue }
            $lines.Add('### ' + $id); $lines.Add(''); $lines.Add([string](Get-Prop $rule 'rule')); $lines.Add('')
            $context = Get-Prop $rule 'context'; if (Test-Str $context) { $lines.Add('- Context: ' + $context) }
            $owner = Get-Prop $rule 'owner'; if (Test-Str (Get-Prop $owner 'type')) { $lines.Add('- Existing owner: ' + (Get-Prop $owner 'type') + $(if (Test-Str (Get-Prop $owner 'component')) { ' (' + (Get-Prop $owner 'component') + ')' } else { '' })) }
            $action = Get-Prop $rule 'targetAction'; if (Test-Str $action) { $lines.Add('- Development action: ' + $action) }
            $decisionRef = Get-Prop $rule 'decisionRef'; if (Test-Str $decisionRef) { $lines.Add('- Confirmed decision: ' + $decisionRef) }
            foreach ($pathKey in @('cdms', 'dab', 'ui')) {
                $path = Get-Prop (Get-Prop $rule 'paths') $pathKey
                if ($null -ne $path) {
                    $status = Get-Prop $path 'status'; $refs = (Get-Arr (Get-Prop $path 'evidence'))
                    $lines.Add('- Path ' + $pathKey + ': ' + $status + $(if ($refs.Count) { ' (' + ($refs -join ', ') + ')' } else { '' }))
                }
            }
            foreach ($branch in (Get-Arr (Get-Prop $rule 'branches'))) {
                $branchId = Get-Prop $branch 'id'
                if (Test-Str $branchId) {
                    $lines.Add('- Branch ' + $branchId + ': when ' + (Get-Prop $branch 'condition') + ', ' + (Get-Prop $branch 'expected') + '.')
                    foreach ($field in @(@('risk', 'Risk'), @('approach', 'Proposed approach'))) {
                        $value = Get-Prop $branch $field[0]; if (Test-Str $value) { $lines.Add('  - ' + $field[1] + ': ' + $value) }
                    }
                    $branchAcceptance = (Get-Arr (Get-Prop $branch 'acceptance')); if ($branchAcceptance.Count) { $lines.Add('  - Acceptance criteria: ' + ($branchAcceptance -join ', ')) }
                    foreach ($evidenceId in (Get-Arr (Get-Prop $branch 'evidence'))) { $lines.Add('  - Evidence: ' + $evidenceId) }
                }
            }
            foreach ($gap in (Get-Arr (Get-Prop $rule 'gaps'))) {
                if ((Get-Prop $gap 'status') -ne 'resolved') {
                    $impact = Get-Prop $gap 'impact'; $description = Get-Prop $gap 'description'
                    $lines.Add('- Open issue: ' + $description + ' (' + $impact + ').')
                }
            }
            $lines.Add('')
        }
        $lines.Add('## Acceptance criteria'); $lines.Add('')
        foreach ($criterion in $ownCriteria) { $lines.Add('- ' + (Get-Prop $criterion 'id') + ' (' + (Get-Prop $criterion 'type') + '): ' + (Get-Prop $criterion 'criterion')) }
        if (-not $ownCriteria.Count) { $lines.Add('None for this document; see REQUEST.md.') }; $lines.Add('')
        # Same sections as finalDocuments() in core.js: implementation approach, validation requirements and test scenarios.
        $lines.Add('## Technical implementation approach'); $lines.Add('')
        $areaNames = @{ cdms = 'CDMS'; dab = 'DAB (GraphQL)'; ui = 'Shared Angular UI' }
        $applyingKeys = @($ownKeys | Where-Object { (Get-Prop (Get-Prop $paths $_) 'applies') -eq $true })
        foreach ($rule in $ownRules) { $act = Get-Prop $rule 'targetAction'; $lines.Add('- ' + (Get-Prop $rule 'id') + ': ' + $(if (Test-Str $act) { $act } else { 'see rule' }) + $(if ($applyingKeys.Count) { ' in ' + (@($applyingKeys | ForEach-Object { $areaNames[$_] }) -join ' and ') } else { '' }) + '.') }
        if ($documentKey -eq 'dab' -and -not (Test-In (Get-TargetAreas $application) 'cdms')) { $lines.Add('- CDMS was analyzed as a read-only implementation reference; see the code references.') }
        if (-not $ownRules.Count) { $lines.Add('None.') }; $lines.Add('')
        $lines.Add('## Existing code references'); $lines.Add('')
        foreach ($item in $citedEvidence) { $lines.Add('- ' + (Get-Prop $item 'id') + ' [' + (Get-Prop $item 'level') + ']: ' + (Get-Prop $item 'source') + ' ' + $dash + ' ' + (Get-Prop $item 'location') + ': ' + (Get-Prop $item 'summary') + $(if (Test-Str (Get-Prop $item 'revision')) { ' (' + (Get-Prop $item 'revision') + ')' } else { '' })) }
        if (-not $citedEvidence.Count) { $lines.Add('None cited.') }; $lines.Add('')
        $lines.Add('## Dependencies'); $lines.Add('')
        foreach ($dependency in $dependencies) { $lines.Add('- ' + (Get-Prop $dependency 'id') + ' (' + (Get-Prop $dependency 'repository') + '): ' + (Get-Prop $dependency 'responsibility')) }
        if (-not $dependencies.Count) { $lines.Add('None.') }; $lines.Add('')
        $lines.Add('## Validation requirements'); $lines.Add('')
        foreach ($rule in $ownRules) { $cov = (Get-Arr (Get-Prop $rule 'coverage')); if (-not $cov.Count) { $cov = @('positive', 'negative') }; $ot = Get-Prop (Get-Prop $rule 'owner') 'type'; $lines.Add('- ' + (Get-Prop $rule 'id') + ': ' + ($cov -join ', ') + ' scenarios' + $(if (Test-Str $ot) { '; enforced by ' + $ot } else { '' }) + '.') }
        if (-not $ownRules.Count) { $lines.Add('None.') }; $lines.Add('')
        $lines.Add('## Test scenarios'); $lines.Add('')
        foreach ($criterion in $ownCriteria) { $lines.Add('- Verify ' + (Get-Prop $criterion 'id') + ' (' + (Get-Prop $criterion 'type') + ')') }
        if (-not $ownCriteria.Count) { $lines.Add('None for this document.') }; $lines.Add('')
        $lines.Add('## Business decisions'); $lines.Add('')
        foreach ($decision in $decisions) { if ((Get-Prop $decision 'status') -eq 'approved') { $lines.Add('- ' + (Get-Prop $decision 'id') + ': ' + (Get-Prop $decision 'decision') + ' (' + (Get-Prop $decision 'evidence') + ')') } }
        if (-not @($decisions | Where-Object { (Get-Prop $_ 'status') -eq 'approved' }).Count) { $lines.Add('None recorded.') }; $lines.Add('')
        $lines.Add('## Risks, open issues and assumptions'); $lines.Add('')
        foreach ($question in $questions) { if ((Get-Prop $question 'status') -eq 'deferred') { $lines.Add('- ' + (Get-Prop $question 'id') + ': ' + (Get-Prop $question 'question') + ' (decide later)') } }
        foreach ($assumption in $assumptions) { if ((Get-Prop $assumption 'status') -ne 'resolved') { $lines.Add('- ' + (Get-Prop $assumption 'id') + ': ' + (Get-Prop $assumption 'text') + ' (open)') } }
        if (-not @($questions | Where-Object { (Get-Prop $_ 'status') -eq 'deferred' }).Count -and -not @($assumptions | Where-Object { (Get-Prop $_ 'status') -ne 'resolved' }).Count) { $lines.Add('None recorded.') }; $lines.Add('')
        $lines.Add('## Related requirements owned by other PBIs'); $lines.Add('')
        foreach ($rule in $relatedRules) { $lines.Add('- ' + (Get-Prop $rule 'id') + ': ' + (Get-Prop $rule 'rule')) }
        foreach ($criterion in $relatedCriteria) { $lines.Add('- ' + (Get-Prop $criterion 'id') + ' (' + (Get-Prop $criterion 'type') + '): ' + (Get-Prop $criterion 'criterion')) }
        if (-not $relatedRules.Count -and -not $relatedCriteria.Count) { $lines.Add('None.') }; $lines.Add('')
        $lines.Add('## Approval'); $lines.Add(''); $approval = Get-Prop (Get-Prop $state 'approvals') 'user'
        $lines.Add('- Final user approval: ' + (Get-Prop $approval 'by') + ', ' + (Get-Prop $approval 'at') + ' (Approve & Generate in Copilot Chat).')
        $text = $lines -join "`n"
        $json = [ordered]@{ schemaVersion = 1; generatedBy = 'Akzo SDD PBI Builder ' + $Bundle.packageVersion; document = $name; target = $documentKey; developmentTarget = $application; pbi = [ordered]@{ number = (Get-Prop $request 'number'); title = (Get-Prop $request 'title'); folder = $folder; description = (Get-Prop $request 'description') }; status = 'Development-Ready'; approval = [ordered]@{ user = [ordered]@{ by = (Get-Prop $approval 'by'); at = (Get-Prop $approval 'at'); evidence = (Get-Prop $approval 'evidence') } }; rules = $ownRules; relatedRules = @($relatedRules | ForEach-Object { Get-Prop $_ 'id' }); relatedRuleDetails = @($relatedRules | ForEach-Object { [ordered]@{ id = (Get-Prop $_ 'id'); rule = (Get-Prop $_ 'rule') } }); acceptanceCriteria = $ownCriteria; relatedAcceptanceCriteria = $relatedCriteria; evidence = $citedEvidence; dependencies = $dependencies; decisions = @($decisions | Where-Object { (Get-Prop $_ 'status') -eq 'approved' }) }
        $results += ,@{ name = $name; markdown = $text; json = (ConvertTo-Json -InputObject $json -Depth 100) + "`n"; docx = (New-DocxBytes $text) }
    }
    return ,$results
}
function Invoke-ApproveAndGenerate {
    if (-not $Pbi) { throw 'Use -Pbi <folder name> (the folder under playbook/pbis).' }
    if (-not (Test-Str $Approver)) { throw 'Use -Approver with the name the user gave for the explicit approval.' }
    if (-not (Test-Str $ReviewedContent) -or $ReviewedContent -cnotmatch '\A[0-9a-f]{64}\z') { throw 'Use -ReviewedContent with the 64-character content fingerprint from the latest readiness review.' }
    $script:LastReadiness = $null
    # Earlier final documents are replaced below (with history backups), so they do not block a renewed approval.
    [void](Invoke-CheckPbi -IgnoreFinal)
    $report = $script:LastReadiness
    if ($null -eq $report -or -not (Test-Same $report.reviewedContent $ReviewedContent)) { throw 'This PBI changed after review. Run CheckPbi again and request a new explicit approval.' }
    $blocking = @($report.issues | Where-Object {
        -not ((($_.code -ceq 'APPROVAL_PENDING' -or $_.code -ceq 'APPROVAL_UNBOUND') -and $_.ref -ceq 'user') -or
            ($_.code -ceq 'APPROVAL_STALE' -and $_.ref.StartsWith('user:', [System.StringComparison]::Ordinal)) -or
            $_.code -ceq 'STATUS_OVERCLAIMED')
    })
    if ($blocking.Count) { throw ('Not ready for approval (' + $report.computedStatus + '): ' + (($blocking | ForEach-Object { '[' + $_.code + '] ' + $_.ref + ': ' + $_.message }) -join '; ')) }
    $folder = Resolve-PbiFolder $Pbi
    $raw = Read-Text "$folder/pbi-state.json"; $state = $raw | ConvertFrom-Json
    $requestRaw = Read-Text "$folder/pbi.json"; if ($null -eq $requestRaw) { $request = [pscustomobject]@{} } else { $request = $requestRaw | ConvertFrom-Json }
    $secretPatterns = @(
        @{ kind = 'private key'; regex = '-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----' },
        @{ kind = 'GitHub token'; regex = '\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b' },
        @{ kind = 'AWS access key'; regex = '\b(?:AKIA|ASIA)[0-9A-Z]{16}\b' },
        @{ kind = 'Slack token'; regex = '\bxox[abprs]-[A-Za-z0-9-]{10,}\b' },
        @{ kind = 'Google API key'; regex = '\bAIza[0-9A-Za-z_-]{35}\b' },
        @{ kind = 'JWT'; regex = '\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b' },
        @{ kind = 'bearer token'; regex = '\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*' },
        @{ kind = 'SAS signature'; regex = '[?&]sig=[A-Za-z0-9%+/=]{20,}' },
        @{ kind = 'connection string credential'; regex = '(?im)(?:^|[;"''\s])(?:Password|Pwd|AccountKey|SharedAccessKey|Client ?Secret)\s*=\s*(?:"[^"\r\n]+"|''[^''\r\n]+''|[^;''"\s]+)' },
        @{ kind = 'credential assignment'; regex = '(?i)["'']?\b(?:password|passwd|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|refresh[_-]?token|private[_-]?key|token)["'']?\s*[:=]\s*["'']?[^\s"'',;]{8,}' }
    )
    foreach ($name in @('pbi-state.json', 'pbi.json', 'REQUEST.md', 'DRAFT-PBI.md', 'EVIDENCE.md', 'OPEN-QUESTIONS.md', 'DECISION-LOG.md', 'VALIDATION-MATRIX.md')) {
        $content = Read-Text "$folder/$name"
        if ($null -eq $content) { continue }
        foreach ($secret in $secretPatterns) {
            if ([regex]::IsMatch($content, $secret.regex)) { throw "Sensitive data found in $folder/$name ($($secret.kind)); redact it and review again." }
        }
    }
    $oldApproval = Get-Prop (Get-Prop $state 'approvals') 'user'
    $stateApprovals = Get-Prop $state 'approvals'; if (-not (Test-Obj $stateApprovals)) { $stateApprovals = [pscustomobject]@{} }
    $basisRaw = $report.review['user']['basis']
    $basis = (ConvertTo-Json -InputObject $basisRaw -Depth 100) | ConvertFrom-Json
    $at = [DateTime]::UtcNow.ToString('o')
    $newApproval = [pscustomobject]@{ status = 'approved'; by = $Approver.Trim(); at = $at; evidence = 'Approve & Generate in Copilot Chat'; basis = $basis }
    Set-Prop $stateApprovals 'user' $newApproval; Set-Prop $state 'approvals' $stateApprovals; Set-Prop $state 'status' 'Development-Ready'
    if ((Get-Prop $oldApproval 'status') -ceq 'approved') {
        $history = (Get-Arr (Get-Prop $state 'approvalHistory'))
        $oldRecord = [ordered]@{}
        foreach ($property in $oldApproval.PSObject.Properties) { $oldRecord[$property.Name] = $property.Value }
        $oldRecord['scope'] = 'user'; $oldRecord['status'] = 'stale'; $oldRecord['staleReason'] = 'Replaced by a new final approval'
        $history += [pscustomobject]$oldRecord
        Set-Prop $state 'approvalHistory' $history
    }
    if ((Get-ReviewFingerprint $folder) -cne $ReviewedContent) { throw 'This PBI changed after review. Run CheckPbi again and request a new explicit approval.' }
    $draft = Read-Text "$folder/DRAFT-PBI.md"
    if ($null -ne $draft) { $draft = [regex]::Replace($draft, '(?m)^Status:.*$', 'Status: Development-Ready') }
    $out = [ordered]@{ 'pbi-state.json' = (ConvertTo-Json -InputObject $state -Depth 100) + "`n" }
    if ($null -ne $draft) { $out['DRAFT-PBI.md'] = $draft }
    foreach ($doc in (Get-ChatFinalDocuments $folder $state $request)) {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($doc.name)
        $out[$doc.name] = $doc.markdown; $out[$base + '.json'] = $doc.json; $out[$base + '.docx'] = $doc.docx
    }
    $finalNames = @('REFINED-PBI.md', 'REFINED-PBI.json', 'REFINED-PBI.docx', 'Refined-PBI-CDMS.md', 'Refined-PBI-CDMS.json', 'Refined-PBI-CDMS.docx', 'Refined-PBI-DAB.md', 'Refined-PBI-DAB.json', 'Refined-PBI-DAB.docx', 'Refined-PBI-UI.md', 'Refined-PBI-UI.json', 'Refined-PBI-UI.docx', 'PBI-CDMS.md', 'PBI-CDMS.json', 'PBI-CDMS.docx', 'PBI-DAB.md', 'PBI-DAB.json', 'PBI-DAB.docx', 'PBI-UI.md', 'PBI-UI.json', 'PBI-UI.docx', 'CDMS-REFINED-PBI.md', 'CDMS-REFINED-PBI.json', 'CDMS-REFINED-PBI.docx', 'DAB-REFINED-PBI.md', 'DAB-REFINED-PBI.json', 'DAB-REFINED-PBI.docx')
    $retire = @($finalNames | Where-Object { -not $out.Contains($_) -and [System.IO.File]::Exists((Get-Full "$folder/$_")) })
    $prior = @{}; $written = New-Object 'System.Collections.Generic.List[string]'; $stamp = Get-Batch
    foreach ($name in @($out.Keys) + $retire) { $full = Get-Full "$folder/$name"; $prior[$name] = if ([System.IO.File]::Exists($full)) { [System.IO.File]::ReadAllBytes($full) } else { $null } }
    try {
        foreach ($name in @($out.Keys) + $retire) {
            if ($null -ne $prior[$name]) {
                $history = "$folder/history/$([System.IO.Path]::GetFileNameWithoutExtension($name)).$stamp$([System.IO.Path]::GetExtension($name))"
                $historyFull = Get-Full $history; [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($historyFull)); [System.IO.File]::WriteAllBytes($historyFull, $prior[$name])
            }
        }
        foreach ($name in $out.Keys) {
            $full = Get-Full "$folder/$name"; [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($full))
            $written.Add($name)
            if ($out[$name] -is [byte[]]) { [System.IO.File]::WriteAllBytes($full, $out[$name]) } else { [System.IO.File]::WriteAllText($full, [string]$out[$name], $Utf8) }
        }
        foreach ($name in $retire) {
            $full = Get-Full "$folder/$name"; [System.IO.File]::Delete($full); $written.Add($name)
        }
        [void](Invoke-CheckPbi)
        if (-not $script:LastReadiness.finalAllowed -or $script:LastReadiness.issues.Count) {
            $details = @($script:LastReadiness.issues | ForEach-Object { $_.code + ' ' + $_.ref + ': ' + $_.message })
            throw ('Generated files did not pass the readiness check: ' + ($details -join '; '))
        }
        Write-Host "Approved and generated: $($out.Keys -join ', ')"
        Write-Host 'Phase: COMPLETE. Every Refined PBI file was written and passed the readiness check.'
        return $true
    } catch {
        $failure = $_.Exception.Message; $restoreErrors = @()
        foreach ($name in $written) {
            try {
                $full = Get-Full "$folder/$name"
                if ($null -eq $prior[$name]) { if ([System.IO.File]::Exists($full)) { [System.IO.File]::Delete($full) } }
                else { [System.IO.File]::WriteAllBytes($full, $prior[$name]) }
            } catch { $restoreErrors += $name }
        }
        if ($restoreErrors.Count) { throw "Generation failed: $failure. Could not restore: $($restoreErrors -join ', ')." }
        throw "Generation failed; earlier files were restored. $failure"
    }
}
function Resolve-PbiFolder([string]$value) {
    if (-not $value) { throw 'Use -Pbi <folder name or root-qualified folder>.' }
    $folder = $value.Replace('\', '/').TrimEnd('/')
    if ($folder -notmatch '^(Source/)?playbook/pbis/') {
        if ($folder.Contains('/')) { throw 'Select one direct child of playbook/pbis or Source/playbook/pbis.' }
        $candidates = @(@("playbook/pbis/$folder", "Source/playbook/pbis/$folder") | Where-Object { [System.IO.Directory]::Exists((Get-Full $_)) })
        if ($candidates.Count -gt 1) { throw 'Multiple PBI roots match; pass the explicit root-qualified folder.' }
        $folder = if ($candidates.Count -eq 1) { $candidates[0] } else { "playbook/pbis/$folder" }
    }
    if (-not (Test-SafePath $folder) -or $folder -notmatch '^(Source/)?playbook/pbis/[^/]+$') { throw 'Select one PBI folder under playbook/pbis or Source/playbook/pbis.' }
    return $folder
}
# -IgnoreFinal: final documents about to be regenerated are not read, as checkPbi(root, folder, true) in core.js does before approval.
function Get-PbiReport([switch]$IgnoreFinal) {
    $folder = Resolve-PbiFolder $Pbi
    $raw = Read-Text "$folder/pbi-state.json"; $state = $null
    if ($null -ne $raw) { try { $state = $raw | ConvertFrom-Json } catch { $state = $null } }
    $files = New-Map
    foreach ($e in (Get-Arr (Get-Prop $state 'evidence'))) {
        $src = Get-Prop $e 'source'
        if ((Test-Obj $e) -and (Test-Same (Get-Prop $e 'kind') 'repo-file') -and (Test-SafePath $src) -and -not $files.ContainsKey($src)) {
            $full = Get-Full $src; $files[$src] = if ([System.IO.File]::Exists($full)) { Get-Hash ([System.IO.File]::ReadAllBytes($full)) } else { $null }
        }
    }
    # 4.0 names are still read when the 4.1 names are absent (same as checkPbi in core.js).
    $userApproval = Get-Prop (Get-Prop $state 'approvals') 'user'
    $needLegacy = (Test-Obj $userApproval) -and (Test-Has (Get-Prop $userApproval 'basis') 'reviewedContent')
    $reviewedContent = Get-ReviewFingerprint $folder $files -Legacy:$needLegacy
    $legacyReviewedContent = $script:LegacyReviewedContent
    $docs = @{ request = Read-Text "$folder/REQUEST.md"; draft = Read-Text "$folder/DRAFT-PBI.md"; refined = Read-Text "$folder/REFINED-PBI.md"; cdmsRefined = Read-Text "$folder/Refined-PBI-CDMS.md"; dabRefined = Read-Text "$folder/Refined-PBI-DAB.md"; uiRefined = Read-Text "$folder/Refined-PBI-UI.md"; application = (Get-Application $folder); decisionLog = Read-Text "$folder/DECISION-LOG.md"; files = $files; reviewedContent = $reviewedContent; legacyReviewedContent = $legacyReviewedContent }
    foreach ($pair in @(@('cdmsRefined', 'PBI-CDMS.md'), @('dabRefined', 'PBI-DAB.md'), @('uiRefined', 'PBI-UI.md'), @('cdmsRefined', 'CDMS-REFINED-PBI.md'), @('dabRefined', 'DAB-REFINED-PBI.md'))) { if ($null -eq $docs[$pair[0]]) { $docs[$pair[0]] = Read-Text "$folder/$($pair[1])" } }
    if ($IgnoreFinal) { foreach ($k in @('refined', 'cdmsRefined', 'dabRefined', 'uiRefined')) { $docs[$k] = $null } }
    $r = Get-Readiness $state $docs $folder.Split('/')[-1]
    if (-not (Test-SameText (Read-Text "$folder/pbi-state.json") $raw) -or -not (Test-Same (Get-ReviewFingerprint $folder) $reviewedContent)) { throw 'PBI changed while it was being reviewed. Reload the review and try again.' }
    return $r
}
function Invoke-CheckPbi([switch]$IgnoreFinal) {
    $r = Get-PbiReport -IgnoreFinal:$IgnoreFinal
    $script:LastReadiness = $r
    if ($Json) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $r -Depth 6 -Compress)) }
    else {
        Write-Host "Readiness for $($r.pbi)"; Write-Host "Computed status: $($r.computedStatus)$(if ($r.claimedStatus) { " (claimed: $($r.claimedStatus))" })"
        Write-Host "Final REFINED-PBI.md allowed: $(if ($r.finalAllowed) { 'yes' } else { 'no' })"
        if ($r.issues.Count) { foreach ($x in $r.issues) { Write-Host "[$($x.cap)] $($x.code) $($x.ref): $($x.message)" } } else { Write-Host 'No issues found.' }
        foreach ($w in $r.warnings) { Write-Host "[warning: $($w.impact)] $($w.code) $($w.ref): $($w.message)" }
        if ([array]::IndexOf(@($Bundle.readiness.statuses), $r.computedStatus) -ge 3) {
            Write-Host ''; Write-Host 'Approval basis: give the agent the block for each approval it records, unchanged.'
            foreach ($k in $r.review.Keys) { Write-Host "$k (fingerprint $($r.review[$k].fingerprint)): $(ConvertTo-Json -InputObject $r.review[$k].basis -Compress)" }
        }
        Write-Host 'This checks completeness and consistency only, not business correctness or who approved.'
    }
    return [bool]$r.finalAllowed
}

function Set-WorkingSection([string]$text, $section, [string]$body) {
    $heads = @([regex]::Matches($text, '(?m)^(#{1,6})[ \t]+(.+?)[ \t]*\r?$'))
    $names = @($section.title) + @($section.aliases)
    for ($i = $heads.Count - 1; $i -ge 0; $i--) {
        $head = $heads[$i]
        if ($names -notcontains $head.Groups[2].Value) { continue }
        $end = $text.Length
        for ($j = $i + 1; $j -lt $heads.Count; $j++) { if ($heads[$j].Groups[1].Length -le $head.Groups[1].Length) { $end = $heads[$j].Index; break } }
        $text = $text.Substring(0, $head.Index) + $text.Substring($end)
    }
    return $text.TrimEnd() + "`n`n## $($section.title)`n`n$body`n"
}
function Get-WorkingFiles($state, $docs) {
    $files = New-Map
    foreach ($name in $docs.Keys) { if ($null -ne $docs[$name]) { $files[$name] = $docs[$name] } }
    foreach ($section in $Bundle.workingSections) {
        if ((Get-Prop $section 'status') -eq $true) {
            $text = if ($files.ContainsKey($section.file)) { $files[$section.file] } else { '# Working PBI' }
            $approvals = Get-Prop $state 'approvals'; if ($null -eq $approvals) { $approvals = [pscustomobject]@{} }
            $body = "Canonical status: $($state.status). See READINESS.json for the current checker result; prior narrative check counts are historical.`n`nApprovals: " + (ConvertTo-Canon $approvals) + "`n`nConditional drafting does not approve implementation or close security blockers."
            $files[$section.file] = Set-WorkingSection $text $section $body
            continue
        }
        $lines = @()
        $source = if ((Get-Prop $section 'analysis') -eq $true) { Get-Prop $state 'analysis' } else { $state }
        foreach ($record in (Get-Arr (Get-Prop $source $section.list))) {
            $fields = @()
            foreach ($key in $section.fields) {
                if (-not (Test-Has $record $key)) { continue }
                $v = Get-Prop $record $key
                $v = if ($v -is [string]) { $v } else { ConvertTo-Canon $v }
                $fields += $key + ': ' + ([regex]::Replace($v, '\r?\n', '<br>'))
            }
            $lines += '- ' + ($fields -join ' | ')
        }
        $body = if ($lines.Count) { $lines -join "`n" } else { 'None recorded.' }
        $text = if ($files.ContainsKey($section.file)) { $files[$section.file] } else { '# ' + $section.file.Replace('.md', '') }
        $files[$section.file] = Set-WorkingSection $text $section $body
    }
    $draft = [regex]::Replace($files['DRAFT-PBI.md'], '(?m)^Status:.*\r?$', ('Status: ' + $state.status))
    if ($draft -notmatch '(?m)^Status:') { $draft = "Status: $($state.status)`n`n" + $draft }
    $files['DRAFT-PBI.md'] = $draft
    if ($docs.ContainsKey('pbi.json') -and $null -ne $docs['pbi.json']) {
        $intake = $docs['pbi.json'] | ConvertFrom-Json
        $before = ConvertTo-Canon $intake
        Set-Prop $intake 'status' $state.status
        $wizard = Get-Prop $intake 'wizard'; if (-not (Test-Obj $wizard)) { $wizard = [pscustomobject]@{} }
        Set-Prop $wizard 'step' $(if (Test-In @('Ready for Review', 'Development-Ready') $state.status) { 'review' } else { 'analysis' })
        Set-Prop $wizard 'status' $(if ($state.status -ceq 'Development-Ready') { 'generated' } elseif ($state.status -ceq 'Ready for Review') { 'ready-for-review' } else { 'analysis' })
        Set-Prop $intake 'wizard' $wizard
        if (Test-Has $state 'sourceAccess') { Set-Prop $intake 'sourceAccess' (Get-Prop $state 'sourceAccess') }
        if (-not (Test-Same $before (ConvertTo-Canon $intake))) { $files['pbi.json'] = (ConvertTo-Json -InputObject $intake -Depth 100) + "`n" }
    }
    return $files
}
function Save-PbiFiles([string]$folder, $files, $expected) {
    $rows = @(); $batch = Get-Batch
    foreach ($name in $files.Keys) {
        if (-not (Test-SafePath $name)) { throw "Invalid working document: $name" }
        $prior = Read-Text "$folder/$name"
        if ($expected.ContainsKey($name) -and -not (Test-SameText $prior $expected[$name])) { throw "PBI changed during synchronization: $name" }
        if (-not (Test-SameText $prior $files[$name])) { $rows += [pscustomobject]@{ name = $name; before = $prior; text = $files[$name] } }
    }
    foreach ($row in $rows) { if ($null -ne $row.before) { Write-Text "$folder/history/$($row.name).$batch" $row.before } }
    foreach ($name in $expected.Keys) { if (-not (Test-SameText (Read-Text "$folder/$name") $expected[$name])) { throw "PBI changed during synchronization: $name" } }
    $touched = @()
    try {
        foreach ($row in $rows) {
            if (-not (Test-SameText (Read-Text "$folder/$($row.name)") $row.before)) { throw "PBI changed during synchronization: $($row.name)" }
            $touched += $row
            Write-Text "$folder/$($row.name)" $row.text
            if (-not (Test-SameText (Read-Text "$folder/$($row.name)") $row.text)) { throw "Saved document did not match: $($row.name)" }
        }
    } catch {
        $failure = $_.Exception.Message; $errors = @()
        [array]::Reverse($touched)
        foreach ($row in $touched) { try { if ($null -eq $row.before) { Remove-File "$folder/$($row.name)" } else { Write-Text "$folder/$($row.name)" $row.before } } catch { $errors += $row.name } }
        throw "Synchronization failed: $failure. Restore failures: $($errors -join ', '). History retained."
    }
    return ,@($rows | ForEach-Object { $_.name })
}
# Every input the readiness check reads (state, working and final documents, attachments, cited evidence sources), plus the
# rules bundle, this engine and config.json. Equal digests mean the saved READINESS.json is still the result, so it is reused.
function Get-SyncDigest([string]$folder, $state) {
    $rows = New-Object System.Collections.Generic.List[string]
    $hashOf = { param($full) if ([System.IO.File]::Exists($full)) { Get-Hash ([System.IO.File]::ReadAllBytes($full)) } else { '-' } }
    $rows.Add('engine:' + $script:BundleHash + ':' + (& $hashOf $PSCommandPath) + ':' + (& $hashOf (Get-Full "$($Bundle.base)/config.json")))
    foreach ($name in @('pbi-state.json', 'pbi.json', 'REQUEST.md', 'DRAFT-PBI.md', 'EVIDENCE.md', 'OPEN-QUESTIONS.md', 'DECISION-LOG.md', 'VALIDATION-MATRIX.md', 'READINESS.json', 'REFINED-PBI.md', 'Refined-PBI-CDMS.md', 'Refined-PBI-DAB.md', 'Refined-PBI-UI.md', 'PBI-CDMS.md', 'PBI-DAB.md', 'PBI-UI.md', 'CDMS-REFINED-PBI.md', 'DAB-REFINED-PBI.md')) { $rows.Add($name + ':' + (& $hashOf (Get-Full "$folder/$name"))) }
    $att = Get-Full "$folder/attachments"
    if ([System.IO.Directory]::Exists($att)) { foreach ($f in @([System.IO.Directory]::GetFiles($att) | Sort-Object)) { $rows.Add('attachment:' + [System.IO.Path]::GetFileName($f) + ':' + (& $hashOf $f)) } }
    foreach ($e in (Get-Arr (Get-Prop $state 'evidence'))) { $src = Get-Prop $e 'source'; if ((Test-Obj $e) -and (Test-Same (Get-Prop $e 'kind') 'repo-file') -and (Test-SafePath $src)) { $rows.Add('source:' + $src + ':' + (& $hashOf (Get-Full $src))) } }
    return Get-TextHash ($rows -join "`n")
}
function Invoke-SyncPbi {
    $folder = Resolve-PbiFolder $Pbi
    $raw = Read-Text "$folder/pbi-state.json"
    if ($null -eq $raw) { throw 'Canonical pbi-state.json is required for synchronization.' }
    $state = $raw | ConvertFrom-Json
    if (-not (Test-Obj $state) -or -not (Test-Num (Get-Prop $state 'schemaVersion')) -or (Get-Prop $state 'schemaVersion') -ne 2) { throw 'Repair the canonical state schema before synchronization.' }
    if (-not (Test-Same $state.pbi $folder.Split('/')[-1]) -or -not (Test-In $Bundle.readiness.statuses $state.status)) { throw 'Repair the canonical state identity or status before synchronization.' }
    if ($Preview) { Write-Host 'Preview only. SyncPbi repairs derived sections and metadata, preserves history, and reruns readiness. No files written.'; return $true }
    # -RefreshEvidence: refresh the evidence index first in this same process (as advanceWorkflow does), saving a second launch on resume.
    $evidence = $null
    if ($RefreshEvidence) { [void](Invoke-RefreshEvidence -Quiet); $evidence = $script:LastEvidence }
    # Nothing readiness reads changed since the last synchronization: reuse its report instead of recomputing (resume fast path).
    $digestPath = "$folder/READINESS.inputs.sha256"; $priorDigest = Read-Text $digestPath; $priorReport = Read-Text "$folder/READINESS.json"
    if ($null -eq $script:AnswerOutcome -and $null -ne $priorDigest -and $null -ne $priorReport -and (Test-Same $priorDigest.Trim() (Get-SyncDigest $folder $state))) {
        $report = $priorReport | ConvertFrom-Json
        $gate = Get-QuestionGate $state $report
        $out = [ordered]@{ state = $state; report = $report; changed = @(); gate = $gate; phase = (Get-RefinementPhase $folder $state $gate $report); reused = $true }
        if ($null -ne $script:TargetOutcome) { $out['target'] = $script:TargetOutcome }
        if ($null -ne $evidence) { $out['evidence'] = $evidence }
        if ($Json) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $out -Depth 100 -Compress)) }
        else { Write-Host "Nothing changed since the last synchronization. Readiness: $($report.computedStatus); finalAllowed=$($report.finalAllowed)." }
        return $true
    }
    $changed = @()
    for ($pass = 0; $pass -lt 2; $pass++) {
        $docs = New-Map
        foreach ($section in $Bundle.workingSections) { $docs[$section.file] = Read-Text "$folder/$($section.file)" }
        $docs['pbi.json'] = Read-Text "$folder/pbi.json"
        $files = Get-WorkingFiles $state $docs
        $files['pbi-state.json'] = if ($pass -eq 0) { $raw } else { (ConvertTo-Json -InputObject $state -Depth 100) + "`n" }
        $docs['pbi-state.json'] = $raw
        $changed += Save-PbiFiles $folder $files $docs
        $report = Get-PbiReport
        if (Test-Same $state.status $report.computedStatus) { break }
        Set-Prop $state 'status' $report.computedStatus
    }
    if (-not (Test-Same $state.status $report.claimedStatus)) { throw 'Readiness did not stabilize after synchronization; inspect the canonical state.' }
    $priorReport = Read-Text "$folder/READINESS.json"; $sameReport = $false
    if ($null -ne $priorReport) {
        try { $parsedReport = $priorReport | ConvertFrom-Json; $sameReport = Test-Same (ConvertTo-Canon $parsedReport) (ConvertTo-Canon $report) }
        catch [System.ArgumentException] {
            $warning = 'Repairing invalid derived READINESS.json; the prior file will be retained in history.'
            if ($Json) { [Console]::Error.WriteLine($warning) } else { Write-Warning $warning }
        }
    }
    $outFiles = New-Map; $outFiles['READINESS.json'] = if ($sameReport) { $priorReport } else { (ConvertTo-Json -InputObject $report -Depth 100) + "`n" }
    $expectedReport = New-Map; $expectedReport['READINESS.json'] = $priorReport
    $changed += Save-PbiFiles $folder $outFiles $expectedReport
    Write-Text $digestPath ((Get-SyncDigest $folder $state) + "`n")
    $gate = Get-QuestionGate $state $report
    $out = [ordered]@{ state = $state; report = $report; changed = @($changed | Select-Object -Unique); gate = $gate; phase = (Get-RefinementPhase $folder $state $gate $report) }
    if ($null -ne $script:AnswerOutcome) { $out['answer'] = $script:AnswerOutcome }
    if ($null -ne $script:TargetOutcome) { $out['target'] = $script:TargetOutcome }
    if ($null -ne $evidence) { $out['evidence'] = $evidence }
    if ($Json) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $out -Depth 100 -Compress)) }
    else {
        if ($null -ne $evidence) { Write-Host "Evidence index: checked $($evidence.checked), reusable $(@($evidence.reusable).Count), stale: $(if (@($evidence.stale).Count) { $evidence.stale -join ', ' } else { 'none' })." }
        Write-Host "Synchronized $($out.changed.Count) documents. Readiness: $($report.computedStatus); finalAllowed=$($report.finalAllowed). Decisions and approvals unchanged."
    }
    return $true
}

# ---- Business questions in Copilot Chat: mirrors questionGate(), answerQuestion(), skipQuestion() and updateQuestions() in core.js ----
$script:AnswerOutcome = $null
$script:TargetOutcome = $null
function Test-Mandatory($q) { return (Test-Obj $q) -and ((Get-Prop $q 'id') -is [string]) -and ((Get-Prop $q 'blocking') -is [bool]) -and (Get-Prop $q 'blocking') -and (Test-Same (Get-Prop $q 'owner') 'po-ba') -and -not (Test-Same (Get-Prop $q 'status') 'superseded') }
function Get-QuestionGate($state, $report) {
    $resolved = @($Bundle.readiness.questionResolved)
    $remaining = New-Object System.Collections.Generic.List[string]; $deferred = New-Object System.Collections.Generic.List[string]; $unconfirmed = New-Object System.Collections.Generic.List[string]; $total = 0
    foreach ($q in (Get-Arr (Get-Prop $state 'questions'))) {
        if (-not (Test-Mandatory $q)) { continue }
        $total++; $st = Get-Prop $q 'status'
        if (-not (Test-In $resolved $st)) { $remaining.Add($q.id); if (Test-Same $st 'deferred') { $deferred.Add($q.id) }; continue }
        $by = Get-Prop $q 'answeredBy'; $at = Get-Prop $q 'answeredAt'
        if (-not (Test-Same $st 'not-applicable') -and -not ((Test-Str $by) -and ($at -is [string]) -and $at -ne '')) { $unconfirmed.Add($q.id) }
    }
    $gate = [ordered]@{ mandatory = $total; answered = $total - $remaining.Count; remaining = $remaining.ToArray(); deferred = $deferred.ToArray(); unconfirmed = $unconfirmed.ToArray(); canContinue = ($remaining.Count -eq 0) }
    # CanRefine = mandatory questions answered, required evidence validated and the final approval granted (questionGate in core.js).
    if ($null -ne $report) { $gate['canRefine'] = $gate.canContinue -and (Test-Same $report.computedStatus 'Development-Ready') -and ($report.issues -is [array]) -and (@($report.issues).Count -eq 0) }
    return $gate
}
function Find-Question($state, [string]$id) {
    foreach ($q in (Get-Arr (Get-Prop $state 'questions'))) { if ((Test-Obj $q) -and (Test-Same (Get-Prop $q 'id') $id)) { return $q } }
    throw "Question $id is not in this PBI."
}
function Get-QuestionBasis($state, $q) {
    $ids = New-Object System.Collections.Generic.List[string]
    foreach ($id in (Get-Arr (Get-Prop $q 'evidence')) + (Get-Arr (Get-Prop $q 'recommendationEvidence'))) { if (-not $ids.Contains([string]$id)) { $ids.Add([string]$id) } }
    $items = New-Object System.Collections.Generic.List[object]
    foreach ($id in $ids) {
        $hit = Find-Id (Get-Arr (Get-Prop $state 'evidence')) $id
        if ($null -eq $hit) { $hit = Find-Id (Get-Arr (Get-Prop $state 'acceptanceCriteria')) $id }
        if ($null -eq $hit) { $hit = Find-Id (Get-Arr (Get-Prop $state 'decisions')) $id }
        if ($null -eq $hit) { $hit = $id }
        $items.Add($hit)
    }
    return ConvertTo-Canon ([ordered]@{ question = (Get-Prop $q 'question'); options = (Get-Prop $q 'options'); evidence = $items.ToArray() })
}
# Writes the changed state (and the decision log when a decision was made) with history backups; refuses concurrent edits and rolls back.
function Update-PbiQuestions([scriptblock]$change) {
    $folder = Resolve-PbiFolder $Pbi
    if (-not (Test-Str $Question)) { throw 'Use -Question <id> (for example Q-1).' }
    $p = "$folder/pbi-state.json"; $raw = Read-Text $p
    if ($null -eq $raw) { throw 'This PBI has no pbi-state.json yet. Ask the agent to start the analysis first.' }
    try { $state = $raw | ConvertFrom-Json } catch { throw 'pbi-state.json is not valid JSON. Ask the agent to repair it before answering.' }
    $decision = & $change $state
    $pLog = "$folder/DECISION-LOG.md"; $log = if ($null -ne $decision) { Read-Text $pLog } else { $null }
    $nextState = (ConvertTo-Json -InputObject $state -Depth 100) + "`n"
    $nextLog = $null
    if ($null -ne $decision) {
        $at = -1; if ($null -ne $log) { $m = [regex]::Match($log, '(?m)^## Canonical decision records[ \t]*\r?$'); if ($m.Success) { $at = $m.Index } }
        $tail = if ($at -ge 0) { $log.Substring($at) } else { '' }
        $base = if ($at -ge 0) { $log.Substring(0, $at) } elseif ($null -ne $log) { $log } else { "# Decision log`n`n" }
        $q = Find-Question $state $decision.question
        $end = if ([regex]::IsMatch([string]$decision.decision, '[.!?]\z')) { ' ' } else { '. ' }
        $sup = if ($decision.supersedes) { ', supersedes ' + $decision.supersedes } else { '' }
        $nextLog = $base + $(if ($base.EndsWith("`n")) { '' } else { "`n" }) + '- ' + $decision.id + ' (approved' + $sup + '): ' + $q.id + ' ' + [string](Get-Prop $q 'question') + ' ' + [char]0x2192 + ' ' + $decision.decision + $end + $decision.evidence + ".`n"
        if ($tail) { $nextLog = $nextLog.TrimEnd() + "`n`n" + $tail }
    }
    $stamp = Get-Batch
    Write-Text "$folder/history/pbi-state.$stamp.json" $raw
    if ($null -ne $log) { Write-Text "$folder/history/DECISION-LOG.$stamp.md" $log }
    if (-not (Test-SameText (Read-Text $p) $raw) -or ($null -ne $decision -and -not (Test-SameText (Read-Text $pLog) $log))) { throw 'PBI state or decision log changed while you were answering. Reload the questions and try again.' }
    $touched = New-Object System.Collections.Generic.List[object]
    try {
        $touched.Add(@($p, $raw)); Write-Text $p $nextState; if (-not (Test-SameText (Read-Text $p) $nextState)) { throw 'Saved pbi-state.json did not match.' }
        if ($null -ne $decision) { $touched.Add(@($pLog, $log)); Write-Text $pLog $nextLog; if (-not (Test-SameText (Read-Text $pLog) $nextLog)) { throw 'Saved DECISION-LOG.md did not match.' } }
    }
    catch {
        $failures = @(); for ($i = $touched.Count - 1; $i -ge 0; $i--) { try { if ($null -eq $touched[$i][1]) { Remove-File $touched[$i][0] } else { Write-Text $touched[$i][0] $touched[$i][1] } } catch { $failures += $touched[$i][0] } }
        throw ('Decision update failed: ' + $_.Exception.Message + $(if ($failures.Count) { ' Could not restore: ' + ($failures -join ', ') } else { ' State and decision log were restored; history backups were retained.' }))
    }
    return $decision
}
function Invoke-RecordAnswer {
    if (-not (Test-Str $AnsweredBy) -or $AnsweredBy -match '[\r\n]') { throw 'Use -AnsweredBy with the name of the person who answered; it is recorded with the decision.' }
    if (-not (Test-Str $Option)) { throw 'Use -Option with the chosen option key, or -Option custom with -Custom "<answer>".' }
    $decision = Update-PbiQuestions {
        param($state)
        $q = Find-Question $state $Question
        if (Test-Same (Get-Prop $q 'status') 'superseded') { throw "Question $Question was replaced by another question." }
        $by = $AnsweredBy.Trim()
        if ($Option -ceq 'custom') {
            $text = ([string]$Custom).Trim()
            if ($text.Length -lt 3) { throw 'Enter your custom answer.' }
            # A credential is never written into the decision record (the form redacts it; chat refuses it).
            if ([regex]::IsMatch($text, '(?i)\b(password|pwd|secret|api[_-]?key|access[_-]?token|accountkey|sharedaccesskey)\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY|\beyJ[A-Za-z0-9_-]{8,}\.')) { throw 'The custom answer looks like it contains a credential. Remove it and answer again.' }
        }
        else {
            $o = $null; foreach ($x in (Get-Arr (Get-Prop $q 'options'))) { if ((Test-Obj $x) -and (Test-Same (Get-Prop $x 'key') $Option)) { $o = $x } }
            if ($null -eq $o) { throw 'Choose one of the options or enter a custom answer.' }
            $text = [string]$o.text
        }
        $at = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", [Globalization.CultureInfo]::InvariantCulture)
        $decisions = (Get-Arr (Get-Prop $state 'decisions'))
        $prev = $null; $ref = Get-Prop $q 'decisionRef'; if (Test-Str $ref) { $prev = Find-Id $decisions $ref }
        $n = 0; foreach ($d in $decisions) { if ((Test-Obj $d) -and ([string](Get-Prop $d 'id')) -cmatch '\ADEC-(\d+)\z') { $n = [Math]::Max($n, [int]$Matches[1]) } }
        $kind = if ($Option -ceq 'custom') { 'custom answer' } else { "option $Option" }
        $decision = [pscustomobject][ordered]@{ id = 'DEC-' + ($n + 1); pbi = (Get-Prop $state 'pbi'); status = 'approved'; question = $q.id; decision = $text; evidence = "Selected by $by in Copilot Chat at $at ($kind)"; supersedes = $(if ($prev) { $prev.id } else { '' }) }
        if ($prev) { Set-Prop $prev 'status' 'superseded' }
        Set-Prop $state 'decisions' (@($decisions) + $decision)
        $basis = Get-QuestionBasis $state $q
        Set-Prop $q 'status' 'answered'; Set-Prop $q 'answer' ([pscustomobject][ordered]@{ option = $Option; text = $text }); Set-Prop $q 'resolution' $text
        Set-Prop $q 'decisionRef' $decision.id; Set-Prop $q 'answeredBy' $by; Set-Prop $q 'answeredAt' $at; Set-Prop $q 'answerBasis' $basis
        if (Test-Has $q 'draftAnswer') { $q.PSObject.Properties.Remove('draftAnswer') }
        return $decision
    }
    $script:AnswerOutcome = [ordered]@{ question = $Question; status = 'answered'; decision = $decision.id; text = $decision.decision }
    return (Invoke-SyncPbi)
}
function Invoke-DeferQuestion {
    [void](Update-PbiQuestions { param($state) $q = Find-Question $state $Question; Set-Prop $q 'status' 'deferred'; return $null })
    $script:AnswerOutcome = [ordered]@{ question = $Question; status = 'deferred'; decision = $null; text = $null }
    return (Invoke-SyncPbi)
}

# The areas a development target implements (TARGETS in core.js); an empty array for no or an unknown target.
function Get-TargetAreas($application) {
    if (-not (Test-Str $application)) { return , @() }
    # Returned wrapped: Windows PowerShell would unroll a one-element array into a plain string.
    $areas = Get-Arr (Get-Prop (Get-Prop $Bundle.targets ([string]$application)) 'implement')
    return , $areas
}
# -Action SetTargets: after the user's explicit answer to the scope question, sets the development target to exactly the selected
# areas (-Targets cdms,dab,ui in any order). pbi.json (application and repository roles), REQUEST.md (Development target and
# Repositories) and DECISION-LOG.md are updated with history copies, then the PBI is synchronized. Nothing else is changed;
# an approval given before the change becomes stale, because the reviewed scope changed.
function Invoke-SetTargets {
    $folder = Resolve-PbiFolder $Pbi
    if (-not (Test-Str $AnsweredBy) -or $AnsweredBy -match '[\r\n]') { throw 'Use -AnsweredBy with the name of the user who chose the targets.' }
    $want = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($Targets)) { foreach ($part in ([string]$item).Split(',')) { $t = $part.Trim().ToLowerInvariant(); if ($t -and -not $want.Contains($t)) { $want.Add($t) } } }
    if (-not $want.Count) { throw 'Use -Targets with one or more of cdms, dab and ui.' }
    foreach ($t in $want) { if (-not (Test-In @('cdms', 'dab', 'ui') $t)) { throw "Unknown target '$t'. Use cdms, dab and/or ui." } }
    $key = $null
    foreach ($p in $Bundle.targets.PSObject.Properties) {
        $impl = Get-Arr $p.Value.implement
        if ($impl.Count -eq $want.Count -and @($want | Where-Object { -not (Test-In $impl $_) }).Count -eq 0) { $key = $p.Name; break }
    }
    if ($null -eq $key) { throw ('No development target matches ' + ($want -join ', ') + '.') }
    $T = Get-Prop $Bundle.targets $key
    $raw = Read-Text "$folder/pbi.json"; if ($null -eq $raw) { throw 'This PBI has no pbi.json; start it with the intake first.' }
    try { $request = $raw | ConvertFrom-Json } catch { throw 'pbi.json is not valid JSON; repair it before changing the target.' }
    $old = Get-Application $folder
    $oldTarget = if (Test-Str $old) { Get-Prop $Bundle.targets $old } else { $null }
    $oldLabel = if ($null -ne $oldTarget) { [string]$oldTarget.label } elseif (Test-Str $old) { $old } else { 'Not recorded' }
    if (Test-Same $old $key) {
        $script:TargetOutcome = [ordered]@{ from = $key; to = $key; label = [string]$T.label; changed = $false; documents = (Get-Arr $T.documents) }
        return (Invoke-SyncPbi)
    }
    # Repository roles in the order newPbi writes them: references first, then implementation targets. Paths come from the PBI, else config.json.
    $cfgSources = $null; $cfgRaw = Read-Text "$($Bundle.base)/config.json"
    if ($null -ne $cfgRaw) { try { $cfgSources = Get-Prop ($cfgRaw | ConvertFrom-Json) 'sources' } catch { $cfgSources = $null } }
    $known = @{}; foreach ($r in (Get-Arr (Get-Prop $request 'repositories'))) { $k = Get-Prop $r 'key'; if (Test-Str $k) { $known[$k] = [string](Get-Prop $r 'path') } }
    $legacy = Get-Prop $request 'legacy'
    $repos = New-Object System.Collections.Generic.List[object]; $roles = New-Object System.Collections.Generic.List[string]
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($k in (Get-Arr $T.reference)) { $rows.Add(@([string]$k, 'reference')) }
    foreach ($k in (Get-Arr $T.implement)) { $rows.Add(@([string]$k, 'implement')) }
    foreach ($row in $rows) {
        $k = [string]$row[0]; $use = [string]$row[1]
        $path = if ($known.ContainsKey($k)) { $known[$k] } elseif ($k -eq 'legacy' -and (Test-Obj $legacy) -and (Test-Str (Get-Prop $legacy 'path'))) { [string](Get-Prop $legacy 'path') } elseif (Test-Obj $cfgSources) { [string](Get-Prop $cfgSources $k) } else { '' }
        if ($null -eq $path) { $path = '' }
        $area = [string](Get-Prop $Bundle.areas $k)
        $repos.Add([pscustomobject][ordered]@{ key = $k; use = $use; area = $area; path = $path })
        $role = if ($k -eq 'legacy') { 'Business reference' } elseif ($k -eq 'ui') { if ($use -eq 'implement') { 'Shared frontend (implementation target)' } else { 'Shared frontend (not selected; read only for dependencies)' } } elseif ($use -eq 'implement') { 'Implementation target' } else { 'Implementation reference (read-only)' }
        $where = if ($k -eq 'legacy' -and (Test-Obj $legacy)) { [string](Get-Prop $legacy 'name') + ' (' + $(if ($path) { $path } else { 'path not configured' }) + ')' } elseif ($path) { $path } else { 'not configured' }
        $roles.Add('- ' + $area + ' ' + [string][char]0x2014 + ' ' + $role + ': ' + $where)
    }
    Set-Prop $request 'application' $key; Set-Prop $request 'repositories' $repos.ToArray()
    $at = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $note = 'Development target changed from ' + $oldLabel + ' to ' + [string]$T.label + ' by ' + $AnsweredBy.Trim() + ' in Copilot Chat at ' + $at + '.'
    $files = New-Map; $expected = New-Map
    $files['pbi.json'] = (ConvertTo-Json -InputObject $request -Depth 100) + "`n"; $expected['pbi.json'] = $raw
    $reqText = Read-Text "$folder/REQUEST.md"
    if ($null -ne $reqText) {
        $section = {
            param($text, [string]$title, [string]$body)
            $m = [regex]::Match($text, '(?m)^## ' + [regex]::Escape($title) + '[ \t]*\r?\n')
            if (-not $m.Success) { return $text.TrimEnd() + "`n`n## " + $title + "`n`n" + $body + "`n" }
            $rest = $text.Substring($m.Index + $m.Length); $next = [regex]::Match($rest, '(?m)^## ')
            $tail = if ($next.Success) { $rest.Substring($next.Index) } else { '' }
            return $text.Substring(0, $m.Index + $m.Length) + "`n" + $body + "`n" + $(if ($tail) { "`n" + $tail } else { '' })
        }
        $newReq = & $section $reqText 'Development target' ([string]$T.label + "`n`n" + $note)
        $newReq = & $section $newReq 'Repositories' ($roles -join "`n")
        $files['REQUEST.md'] = $newReq; $expected['REQUEST.md'] = $reqText
    }
    $log = Read-Text "$folder/DECISION-LOG.md"
    $base = if ($null -ne $log) { $log } else { "# Decision log`n`n" }
    $cut = [regex]::Match($base, '(?m)^## Canonical decision records[ \t]*\r?$')
    $files['DECISION-LOG.md'] = if ($cut.Success) { $base.Substring(0, $cut.Index).TrimEnd() + "`n- " + $note + "`n`n" + $base.Substring($cut.Index) } else { $base.TrimEnd() + "`n- " + $note + "`n" }
    if ($null -ne $log) { $expected['DECISION-LOG.md'] = $log }
    [void](Save-PbiFiles $folder $files $expected)
    $script:TargetOutcome = [ordered]@{ from = $old; to = $key; label = [string]$T.label; changed = $true; documents = (Get-Arr $T.documents) }
    return (Invoke-SyncPbi)
}

# ---- Evidence fingerprints: mirrors refreshEvidence() in core.js ----
function Invoke-RefreshEvidence([switch]$Quiet) {
    $out = [ordered]@{ checked = 0; fingerprinted = @(); stale = @(); skipped = @(); reusable = @(); written = $false }
    $raw = Read-Text $Bundle.knowledgeIndex
    if ($null -ne $raw) {
        try { $index = $raw | ConvertFrom-Json } catch { throw "$($Bundle.knowledgeIndex) is not valid JSON. Fix it before refreshing." }
        if (-not (Test-Obj $index) -or -not (Test-One (Get-Prop $index 'schemaVersion')) -or -not ((Get-Prop $index 'entries') -is [array])) { throw "Unsupported $($Bundle.knowledgeIndex); expected schemaVersion 1 with an entries list." }
        $changed = $false; $hashes = New-Map; $identityRead = $false; $commit = $null
        $hashOf = {
            param($p)
            if ($hashes.ContainsKey($p)) { return $hashes[$p] }
            $full = Get-Full $p
            if ([System.IO.Directory]::Exists($full)) { throw "Evidence path is a folder, not a file: $p" }
            $v = if ([System.IO.File]::Exists($full)) { Get-Hash ([System.IO.File]::ReadAllBytes($full)) } else { $null }
            $hashes[$p] = $v
            return $v
        }
        foreach ($e in $index.entries) {
            if (-not (Test-Obj $e)) { continue }
            $id = if ((Get-Prop $e 'id') -is [string]) { $e.id } elseif ((Get-Prop $e 'path') -is [string]) { $e.path } else { '' }
            # shortcut: only paths inside the selected repository can be hashed; external sources need the revision recorded by the agent.
            $p = Get-Prop $e 'path'
            if (-not (Test-SafePath $p)) { $out.skipped += $id; continue }
            $out.checked = $out.checked + 1
            $h = & $hashOf $p
            $hadFingerprint = (Get-Prop $e 'sha256') -is [string]
            $reasons = @()
            $isStale = ((Get-Prop $e 'stale') -is [bool]) -and (Get-Prop $e 'stale')
            if ($null -eq $h) {
                $reasons += 'missing'
            }
            elseif (-not ((Get-Prop $e 'sha256') -is [string])) { Set-Prop $e 'sha256' $h; $changed = $true; $out.fingerprinted += $id; if ($isStale) { $out.stale += $id } }
            elseif (-not (Test-Same $e.sha256 $h)) { $reasons += 'changed'; Set-Prop $e 'sha256' $h; $changed = $true }
            elseif ($isStale) { $out.stale += $id }
            # dependsOn: a changed dependency makes the finding unsafe to reuse (same rules as refreshEvidence in core.js).
            $deps = New-Object System.Collections.Generic.List[string]
            $dl = Get-Prop $e 'dependsOn'
            if ((Test-Has $e 'dependsOn') -and -not ($dl -is [array])) { $reasons += 'invalid-dependency' }
            if ($dl -is [array]) { foreach ($d in $dl) { if (-not ($d -is [string]) -or -not (Test-SafePath $d)) { $reasons += 'invalid-dependency' } } }
            if ($dl -is [array]) { foreach ($d in $dl) { if (($d -is [string]) -and (Test-SafePath $d) -and -not $deps.Contains($d)) { $deps.Add($d) } } }
            if ($null -ne $h -and ($deps.Count -or (Test-Obj (Get-Prop $e 'dependencyHashes')))) {
                $had = Get-Prop $e 'dependencyHashes'; if (-not (Test-Obj $had)) { $had = [pscustomobject]@{} }
                $now = [ordered]@{}; $moved = $false
                if ($hadFingerprint -and -not (Test-Obj (Get-Prop $e 'dependencyHashes')) -and $deps.Count) { $moved = $true }
                if (Test-Obj (Get-Prop $e 'dependencyHashes')) {
                    if ((Get-Keys $had).Count -ne $deps.Count) { $moved = $true }
                    foreach ($d in $deps) { if (-not (Test-Has $had $d)) { $moved = $true } }
                }
                foreach ($d in $deps) { $dh = & $hashOf $d; $now[$d] = $dh; if ($null -eq $dh -or ((Test-Has $had $d) -and -not (Test-SameText (Get-Prop $had $d) $dh))) { $moved = $true } }
                $hadKeys = Get-Keys $had
                $differs = ($hadKeys.Count -ne $now.Count)
                if (-not $differs) { foreach ($k in $now.Keys) { if (-not (Test-Has $had $k) -or -not (Test-SameText (Get-Prop $had $k) $now[$k])) { $differs = $true } } }
                if ($differs) { Set-Prop $e 'dependencyHashes' ([pscustomobject]$now); $changed = $true }
                if ($moved) { $reasons += 'dependency-changed' }
            }
            if ((Get-Prop $e 'revision') -is [string]) {
                if ((Get-Prop $e 'fingerprintedRevision') -is [string] -and -not (Test-Same $e.fingerprintedRevision $e.revision)) { $reasons += 'revision-changed' }
                if (-not (Test-Same (Get-Prop $e 'fingerprintedRevision') $e.revision)) { Set-Prop $e 'fingerprintedRevision' $e.revision; $changed = $true }
            }
            if ((Get-Prop $e 'repositoryCommit') -is [string]) {
                if (-not $identityRead) {
                    $identityRead = $true; $head = Read-Text '.git/HEAD'
                    if ($null -ne $head) {
                        $head = $head.Trim()
                        if ($head.StartsWith('ref: ', $Ordinal)) {
                            $ref = $head.Substring(5).Trim()
                            if (Test-SafePath ".git/$ref") {
                                $commit = Read-Text ".git/$ref"
                                if ($null -ne $commit) { $commit = $commit.Trim() }
                                if (-not $commit) { foreach ($line in ((Read-Text '.git/packed-refs') -split '\r?\n')) { if ($line -cmatch '^([0-9a-f]{40,64}) (.+)$' -and $Matches[2] -ceq $ref) { $commit = $Matches[1]; break } } }
                            }
                        } elseif ($head -cmatch '^[0-9a-f]{40,64}$') { $commit = $head }
                    }
                }
                if (-not (Test-Same $commit $e.repositoryCommit)) { $reasons += 'repository-changed' }
            }
            if ($reasons.Count) {
                $reason = if ($reasons -contains 'invalid-dependency') { 'invalid-dependency' } else { $reasons[-1] }
                if (-not ((Get-Prop $e 'stale') -eq $true) -or -not (Test-Same (Get-Prop $e 'staleReason') $reason)) { Set-Prop $e 'stale' $true; Set-Prop $e 'staleReason' $reason; $changed = $true }
                if ($out.stale -cnotcontains $id) { $out.stale += $id }
            }
            $finalStale = ((Get-Prop $e 'stale') -is [bool]) -and (Get-Prop $e 'stale')
            if (-not $finalStale) { $out.reusable += $id }
        }
        if ($changed) { Write-Text $Bundle.knowledgeIndex ((ConvertTo-Json -InputObject $index -Depth 100) + "`n"); $out.written = $true }
    }
    $script:LastEvidence = $out
    if ($Quiet) { return -not @($out.stale).Count }
    if ($Json) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $out -Depth 4 -Compress)) }
    elseif ($null -eq $raw) { Write-Host "No evidence index found at $($Bundle.knowledgeIndex). The agent creates it when it records reusable knowledge." }
    else {
        Write-Host "Checked $($out.checked) evidence entries. Newly fingerprinted: $(@($out.fingerprinted).Count). Stale: $(if (@($out.stale).Count) { $out.stale -join ', ' } else { 'none' })."
        if (@($out.skipped).Count) { Write-Host "Outside this repository (not fingerprinted): $($out.skipped -join ', ')" }
    }
    return -not @($out.stale).Count
}

# ---- Settings ----
function Read-Choice([string]$prompt, [string]$default) { $a = Read-Host "$prompt [$default]"; if ([string]::IsNullOrWhiteSpace($a)) { return $default }; return $a.Trim() }
function Read-YesNo([string]$prompt) { return (Read-Host "$prompt [y/N]") -match '^(y|yes)$' }
# 'Name=path' entries (-OtherSource or the prompt); blank entries are ignored, so an empty value clears the list.
function ConvertFrom-OtherSource([string[]]$items) {
    # ';' also separates entries, because powershell.exe -File passes a single string.
    return @($items -split ';' | Where-Object { $_ -and $_.Trim() } | ForEach-Object {
            $i = $_.IndexOf('='); if ($i -lt 1) { throw "Write each other repository as Name=path: $_" }
            [pscustomobject]@{ name = $_.Substring(0, $i).Trim(); path = $_.Substring($i + 1).Trim() } })
}
function Get-ConfigInput([bool]$existingOnly) {
    $raw = Read-Text "$($Bundle.base)/config.json"
    $in = @{ schemaVersion = $null; projectName = (Split-Path -Leaf $script:Repo); ide = 'visualstudio'; role = 'legacy'; includeReferences = $false; sources = @{ legacy = ''; dab = ''; cdms = ''; ui = '' }; others = @() }
    if ($null -ne $raw) {
        try { $old = $raw | ConvertFrom-Json } catch { throw "The existing $($Bundle.base)/config.json is not valid JSON. Fix or remove it, then rerun." }
        $in.schemaVersion = Get-Prop $old 'schemaVersion'
        foreach ($k in 'projectName', 'ide', 'role', 'includeReferences') { if (Test-Has $old $k) { $in[$k] = $old.$k } }
        # As in the wizard, '.' (this repository) is re-derived from the role.
        foreach ($k in $SourceKeys) { $v = Get-Prop (Get-Prop $old 'sources') $k; $in.sources[$k] = if ($v -is [string] -and $v -cne '.') { $v } else { '' } }
        $list = Get-Prop $old 'others'
        if ($list -is [array]) { foreach ($o in $list) { $in.others += [pscustomobject]@{ name = Get-Prop $o 'name'; path = Get-Prop $o 'path' } } }
    }
    elseif ($existingOnly) { throw "No $($Bundle.base)/config.json found. Run Install first." }
    if ($existingOnly) {
        if (@('ProjectName', 'Ide', 'Role', 'LegacySource', 'DabSource', 'CdmsSource', 'UiSource', 'OtherSource', 'ClearSource', 'NoReferences', 'IncludeReferences' | Where-Object { $script:Bound.ContainsKey($_) }).Count) { Write-Warning 'Repair uses the installed config.json; setting parameters were ignored. Use Install to change settings.' }
        return $in
    }
    $oldRole = [string]$in.role
    if ($script:Bound.ContainsKey('ProjectName')) { $in.projectName = $ProjectName }
    if ($script:Bound.ContainsKey('Ide')) { $in.ide = $Ide }
    if ($script:Bound.ContainsKey('Role')) { $in.role = $Role }
    if ($script:Bound.ContainsKey('NoReferences')) { $in.includeReferences = -not $NoReferences }
    if ($script:Bound.ContainsKey('IncludeReferences')) { $in.includeReferences = [bool]$IncludeReferences }
    # An empty value never replaces a saved path; a single space (setup window) or -ClearSource removes it on purpose.
    foreach ($pair in @(@('legacy', 'LegacySource', $LegacySource), @('dab', 'DabSource', $DabSource), @('cdms', 'CdmsSource', $CdmsSource), @('ui', 'UiSource', $UiSource))) {
        if (-not $script:Bound.ContainsKey($pair[1])) { continue }
        if ([string]$pair[2] -ceq '') { Write-Warning "-$($pair[1]) was empty, so the saved $($pair[0]) path was kept. Use -ClearSource $($pair[0]) to remove it." }
        else { $in.sources[$pair[0]] = [string]$pair[2] }
    }
    foreach ($k in @($ClearSource)) { if ($k) { $in.sources[$k] = '' } }
    if ($script:Bound.ContainsKey('OtherSource')) { $in.others = ConvertFrom-OtherSource $OtherSource }
    if ($null -ne $raw -and $in.role -cne $oldRole -and (Test-In $SourceKeys $oldRole) -and ([string]$in.sources[$oldRole]).Trim() -ceq '') {
        Write-Warning "The role of this repository changed from $oldRole to $($in.role). It was configured as '.', so no path for $oldRole is saved now; add one in Repositories if another repository holds it."
    }
    if ($Interactive) {
        $in.projectName = Read-Choice 'Project name' $in.projectName
        $in.ide = Read-Choice 'Editor: visualstudio, vscode or both' $in.ide
        $in.role = Read-Choice 'This repository is: legacy, dab, cdms, ui or other' $in.role
        foreach ($k in $SourceKeys) { if ($in.role -cne $k) { $a = Read-Choice "Optional $k repository path, relative to this repository or absolute (Enter keeps the saved value; type none to clear)" $in.sources[$k]; $in.sources[$k] = $(if ($a -in 'none', '-') { '' } else { $a }) } }
        $in.others = ConvertFrom-OtherSource ((Read-Choice 'Other reference repositories as Name=path, separated by ; (blank if none)' (@($in.others | ForEach-Object { "$($_.name)=$($_.path)" }) -join ';')) -split ';')
        $in.includeReferences = (Read-Choice 'Also install the older ColorDMS analysis documents as optional background (not needed)? y/n' $(if ($in.includeReferences) { 'y' } else { 'n' })) -match '^(y|yes)$'
    }
    return $in
}
function Select-Repo {
    if (-not $Interactive) { $path = $RepoPath }
    else {
        $path = $null
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Select the application repository root'
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $path = $dialog.SelectedPath } else { throw 'Cancelled. Nothing was changed.' }
        }
        catch [System.Management.Automation.RuntimeException] { if ($_.Exception.Message -like 'Cancelled*') { throw }; $path = Read-Host 'Repository root folder' }
        catch { $path = Read-Host 'Repository root folder' }
    }
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Container)) { throw "Repository folder not found: $path" }
    $script:Repo = (Resolve-Path -LiteralPath $path).ProviderPath
    if (-not (Test-Path -LiteralPath (Join-Path $script:Repo '.git'))) {
        Write-Warning "No .git found in $($script:Repo). Make sure this is the application repository root, not a parent folder or one nested project."
        if ($Interactive -and $Action -in 'Install', 'Repair' -and -not (Read-YesNo 'Continue with this folder?')) { throw 'Cancelled. Nothing was changed.' }
    }
}

# ---- Source access: a configured path is not the same as verified read access ----
# Statuses match discoverSources in core.js: readable (a real source file was read), configured-inaccessible, not-configured.
$script:SourceKinds = @('.cs', '.vb', '.js', '.ts', '.html', '.htm', '.aspx', '.ascx', '.asmx', '.sql', '.xaml', '.graphql')
$script:SkipDirs = @('.git', '.vs', '.github', 'bin', 'obj', 'node_modules', 'packages', 'testresults', '.angular', 'dist', 'playbook', 'coverage', '.idea', '.vscode', '.nuget', 'artifacts', '.cache')
function Resolve-SourcePath([string]$p) {
    $n = $p.Replace('/', '\')
    if ([System.IO.Path]::IsPathRooted($n)) { return [System.IO.Path]::GetFullPath($n) }
    return [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($script:Repo, $n))
}
# Bounded breadth-first search for one source file; build output, dependency folders and reparse points are skipped.
function Find-SourceFile([string]$dir) {
    $queue = New-Object System.Collections.Generic.Queue[string]; $queue.Enqueue($dir); $seen = 0
    while ($queue.Count -gt 0 -and $seen -lt 4000) {
        $d = $queue.Dequeue()
        try { $entries = [System.IO.Directory]::GetFileSystemEntries($d) } catch { continue }
        foreach ($e in $entries) {
            $seen++
            $name = [System.IO.Path]::GetFileName($e)
            if ([System.IO.Directory]::Exists($e)) {
                try { $reparse = ([System.IO.File]::GetAttributes($e) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 } catch { $reparse = $true }
                if (-not $reparse -and ($script:SkipDirs -cnotcontains $name.ToLowerInvariant())) { $queue.Enqueue($e) }
            }
            elseif ($script:SourceKinds -contains [System.IO.Path]::GetExtension($name).ToLowerInvariant()) { return $e }
        }
    }
    return $null
}
function Test-FileReadable([string]$f) {
    try { $s = [System.IO.File]::Open($f, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); try { $buf = New-Object byte[] 256; [void]$s.Read($buf, 0, 256) } finally { $s.Dispose() }; return $true } catch { return $false }
}
# Folders of an existing multi-root workspace file at the repository root (null when there is none or it cannot be parsed).
function Get-WorkspaceFolders {
    $file = @([System.IO.Directory]::GetFiles($script:Repo, '*.code-workspace') | Sort-Object)[0]
    if (-not $file) { return $null }
    try {
        $text = [System.IO.File]::ReadAllText($file, $Utf8)
        $json = [regex]::Replace([regex]::Replace($text, '(?m)^\s*//.*$', ''), ',(\s*[}\]])', '$1') | ConvertFrom-Json
        $dir = [System.IO.Path]::GetDirectoryName($file); $list = @()
        foreach ($f in @($json.folders)) { if ($f.path -is [string]) { $list += [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dir, $f.path.Replace('/', '\'))) } }
        return , $list
    }
    catch { return $null }
}
function Get-SourceAccess($c) {
    $items = @()
    foreach ($k in $SourceKeys) { $items += [pscustomobject]@{ key = $k; path = ([string]$c.sources[$k]).Trim() } }
    foreach ($o in @($c.others | Where-Object { $null -ne $_ })) { $items += [pscustomobject]@{ key = "other:$($o.name)"; path = ([string]$o.path).Trim() } }
    $workspace = Get-WorkspaceFolders
    $rows = @()
    foreach ($i in $items) {
        $status = 'not-configured'; $detail = 'No path configured.'; $outside = $false
        if ($i.path -ne '') {
            try { $full = if ($i.path -ceq '.') { $script:Repo } else { Resolve-SourcePath $i.path } } catch { $full = $null }
            if ($null -eq $full) { $status = 'configured-inaccessible'; $detail = 'The path is not valid on this machine.' }
            elseif (-not [System.IO.Directory]::Exists($full)) { $status = 'configured-inaccessible'; $detail = "Folder not found: $full" }
            else {
                $probe = Find-SourceFile $full
                if ($probe -and (Test-FileReadable $probe)) { $status = 'readable'; $detail = "Read $($probe.Substring($full.TrimEnd('\').Length).TrimStart('\').Replace('\', '/')) under $full" }
                else { $status = 'configured-inaccessible'; $detail = "No readable source file found under $full" }
                if ($status -ceq 'readable' -and $null -ne $workspace) {
                    $outside = -not @($workspace | Where-Object { $full.TrimEnd('\').Equals($_.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($_.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase) }).Count
                    if ($outside) { $detail += ' (outside the workspace file: agent file tools may not reach it)' }
                }
            }
        }
        $rows += [pscustomobject]@{ key = $i.key; path = $i.path; status = $status; detail = $detail; outsideWorkspace = $outside }
    }
    return , $rows
}
function Show-SourceAccess($rows) {
    Write-Host 'Source access (configured paths, then what was actually read from this machine):'
    foreach ($r in $rows) { Write-Host ('  {0,-16} {1,-24} {2}' -f $r.key, $r.status, $r.detail) }
}

# ---- Actions ----
function Invoke-Install([bool]$repair) {
    $htmlPath = Join-Path $PSScriptRoot 'Akzo-SDD-PBI-Builder.html'
    if (-not [System.IO.File]::Exists($htmlPath)) { throw 'Akzo-SDD-PBI-Builder.html is missing next to this script. Use the complete package.' }
    $c = New-Config (Get-ConfigInput $repair)
    $rows = Get-Plan (Get-SetupFiles $c ([System.IO.File]::ReadAllText($htmlPath, $Utf8))) (Get-KeptAgents $c)
    Write-Host "Repository: $($script:Repo)"; Write-Host "Agent: $($c.agentName)"
    Show-Plan $rows
    Show-EditorPlan $c $rows
    Show-SourceAccess (Get-SourceAccess $c)
    if ($Preview) { Write-Host 'Preview only. No files written.'; return $true }
    $needsUpdate = @($rows | Where-Object { $_.state -ceq 'update' -or $_.state -ceq 'retire' }).Count -gt 0
    $allow = [bool]$AllowUpdates -or $repair
    if ($Interactive) {
        if (@($rows | Where-Object { $_.state -ceq 'conflict' }).Count) { Write-Host 'Resolve the conflicts above, then rerun.'; return $false }
        if (-not (Read-YesNo 'Apply these changes?')) { Write-Host 'Cancelled. Nothing was changed.'; return $true }
        if ($needsUpdate -and -not $allow) { $allow = Read-YesNo 'Allow updates to previously installed files and retirement of unchanged earlier-version files, with backups?' }
    }
    $r = Invoke-Apply $rows $allow
    Write-Host "Setup complete: $($r.written) files saved."
    if ($r.backups.Count) { Write-Host "Backups: $($Bundle.base)/backups/" }
    if ($r.retired.Count) { Write-Host "Retired: $($r.retired -join ', ')" }
    if ($r.kept.Count) { Write-Host "Kept (edited or unowned; review and remove yourself): $($r.kept -join ', ')" -ForegroundColor Yellow }
    $agents = Get-EditorAgents $c.ide
    foreach ($k in $agents.Keys) {
        $r = @($rows | Where-Object { $_.path -ceq $agents[$k] })[0]
        if ($r.state -ceq 'kept') { Write-Host "Editor $(Get-EditorLabel $k): not changed (-Editor $Editor)." }
        else { Write-Host "Editor $(Get-EditorLabel $k): installed. Open this repository in $(Get-EditorLabel $k) and select $(Get-EditorAgentName $c $k) in Copilot Chat." }
    }
    return $true
}
function Invoke-Verify {
    $m = Read-Manifest
    if ($null -eq $m) { throw 'No PBI Builder installation record found in this folder.' }
    $c = $null; try { $c = New-Config (Get-ConfigInput $true) } catch { Write-Host "Editors could not be checked: config.json could not be read. $($_.Exception.Message)" }
    $agents = if ($c) { Get-EditorAgents $c.ide } else { [ordered]@{} }; $skip = if ($c) { Get-KeptAgents $c } else { @() }
    $bad = New-Object System.Collections.Generic.HashSet[string]
    foreach ($p in $m.files.PSObject.Properties) {
        if ($skip -ccontains $p.Name) { continue }
        $t = Read-Text $p.Name
        $state = if ($null -eq $t) { 'MISSING' } elseif (Test-Same (Get-TextHash $t) $p.Value) { 'OK' } else { 'CHANGED' }
        if ($state -cne 'OK') { [void]$bad.Add($p.Name) }
        Write-Host ('{0,-8} {1}' -f $state, $p.Name)
    }
    if ($c) {
        $expected = Get-SetupFiles $c ''
        foreach ($k in $agents.Keys) {
            $path = $agents[$k]; if ($skip -ccontains $path) { continue }
            $t = Read-Text $path; $rec = Get-Prop $m.files $path
            $line = if ($null -eq $t) { [void]$bad.Add($path); "MISSING - $path is not there. Run Repair$(if ($agents.Count -gt 1) { " -Editor $k" })" }
            elseif (-not ($rec -is [string]) -or -not (Test-Same (Get-TextHash $t) $rec)) { [void]$bad.Add($path); "CHANGED - $path was edited after installation (or is not recorded); Repair never overwrites it. Restore or move it, then run Repair$(if ($agents.Count -gt 1) { " -Editor $k" })" }
            elseif (-not (Test-SameText $t $expected[$path])) { "OK, earlier version - $path matches the installed record; Install$(if ($agents.Count -gt 1) { " -Editor $k" }) updates it to $($Bundle.packageVersion)" }
            else { "OK - $path, agent $(Get-EditorAgentName $c $k)" }
            Write-Host "Editor $(Get-EditorLabel $k): $line"
        }
    }
    Write-Host "Installed package: $($m.packageVersion). This package: $($Bundle.packageVersion)."
    $cfgRaw = Read-Text "$($Bundle.base)/config.json"
    if ($null -ne $cfgRaw) {
        try {
            $cfg = $cfgRaw | ConvertFrom-Json; $src = @{}
            foreach ($k in $SourceKeys) { $v = Get-Prop (Get-Prop $cfg 'sources') $k; $src[$k] = if ($v -is [string]) { $v } else { '' } }
            $oth = @(); $list = Get-Prop $cfg 'others'
            if ($list -is [array]) { foreach ($o in $list) { $oth += [pscustomobject]@{ name = Get-Prop $o 'name'; path = Get-Prop $o 'path' } } }
            Show-SourceAccess (Get-SourceAccess ([pscustomobject]@{ sources = $src; others = $oth }))
        }
        catch { Write-Host 'Source access could not be checked: config.json is not valid.' }
    }
    if ($bad.Count) { Write-Host 'Review missing/changed files. Repair restores missing and unchanged managed files; changed files are never overwritten.' } else { Write-Host 'All recorded files match.' }
    Write-Host 'This does not verify Copilot discovery, source access or AI output.'
    return -not $bad.Count
}
function Invoke-Uninstall {
    $m = Read-Manifest
    if ($null -eq $m) { throw 'No PBI Builder installation record found in this folder. Nothing to uninstall.' }
    $c = $null; try { $c = New-Config (Get-ConfigInput $true) } catch { Write-Warning "Installed config.json could not be read; comparison baseline agents are left in place. $($_.Exception.Message)" }
    $protected = @('playbook/pbis/', "$($Bundle.base)/knowledge/", "$($Bundle.base)/backups/")
    $rows = New-Object System.Collections.ArrayList
    foreach ($p in $m.files.PSObject.Properties) {
        if (@($protected | Where-Object { $p.Name.StartsWith($_, $Ordinal) }).Count -or $p.Name -ceq $Bundle.manifest) { continue }
        $t = Read-Text $p.Name; if ($null -eq $t) { continue }
        [void]$rows.Add([pscustomobject]@{ path = $p.Name; before = $t; state = $(if (Test-Same (Get-TextHash $t) $p.Value) { 'remove' } else { 'keep' }) })
    }
    foreach ($b in $Bundle.baselines.PSObject.Properties) {
        $t = Read-Text $b.Value.path; if ($null -eq $t) { continue }
        [void]$rows.Add([pscustomobject]@{ path = $b.Value.path; before = $t; state = $(if ($c -and (Test-SameText $t (Get-BaselineText $c $b.Value))) { 'remove' } else { 'keep' }) })
    }
    [void]$rows.Add([pscustomobject]@{ path = $Bundle.manifest; before = (Read-Text $Bundle.manifest); state = 'remove' })
    foreach ($r in $rows) { Write-Host ('{0,-8} {1}' -f $r.state, $r.path) }
    Write-Host 'Kept always: playbook/pbis/ (PBIs, decisions, history), knowledge notes, backups, and any file edited since installation.'
    if ($Preview) { Write-Host 'Preview only. No files removed.'; return $true }
    if ($Interactive -and -not (Read-YesNo 'Remove the files marked remove (backed up first)?')) { Write-Host 'Cancelled. Nothing was changed.'; return $true }
    $batch = 'uninstall-' + (Get-Batch); $done = New-Object System.Collections.ArrayList
    $complete = $false; $message = 'Interrupted (for example Ctrl+C).'
    try {
        foreach ($r in @($rows | Where-Object { $_.state -ceq 'remove' })) { Write-Text "$($Bundle.base)/backups/$batch/$($r.path)" $r.before }
        foreach ($r in @($rows | Where-Object { $_.state -ceq 'remove' })) {
            if (-not (Test-SameText (Read-Text $r.path) $r.before)) { throw "A file changed during uninstall: $($r.path)" }
            [void]$done.Add($r); Remove-File $r.path
        }
        $complete = $true
    }
    catch { $message = $_.Exception.Message }
    finally {
        if (-not $complete) { $errors = @(); foreach ($r in $done) { try { Write-Text $r.path $r.before } catch { $errors += $r.path } } }
    }
    if (-not $complete) { throw "Uninstall stopped: $message`n$(if ($errors.Count) { 'Could not restore: ' + ($errors -join ', ') } else { 'Removed files were restored.' })" }
    Write-Host "Uninstalled $($done.Count) files. Backups: $($Bundle.base)/backups/$batch/"
    $kept = @($rows | Where-Object { $_.state -ceq 'keep' })
    if ($kept.Count) { Write-Host "Kept because they were edited: $(($kept | ForEach-Object { $_.path }) -join ', ')" -ForegroundColor Yellow }
    return $true
}

# One JSON line per run in %USERPROFILE%\.akzo-pbi-builder\logs\install.log (paths and outcome only).
$LogFile = Join-Path $env:USERPROFILE '.akzo-pbi-builder\logs\install.log'
function Write-Log([int]$code, [string]$message) {
    try {
        [void][System.IO.Directory]::CreateDirectory((Split-Path $LogFile))
        $line = ConvertTo-Json -Compress ([ordered]@{ time = [DateTime]::UtcNow.ToString('o'); step = $Action; repo = $script:Repo; package = $(if ($Bundle) { $Bundle.packageVersion } else { $null }); exitCode = $code; message = $message })
        [System.IO.File]::AppendAllText($LogFile, $line + "`n", $Utf8)
    }
    catch { }
}
$Bundle = $null
try {
    $Bundle = Read-Bundle
    Select-Repo
    if ($Json) { [Console]::OutputEncoding = $Utf8 }
    $ok = switch ($Action) {
        'Install' { Invoke-Install $false }
        'Repair' { Invoke-Install $true }
        'Verify' { Invoke-Verify }
        'Uninstall' { Invoke-Uninstall }
        'CheckPbi' { Invoke-CheckPbi }
        'SyncPbi' { Invoke-SyncPbi }
        'RecordAnswer' { Invoke-RecordAnswer }
        'DeferQuestion' { Invoke-DeferQuestion }
        'SetTargets' { Invoke-SetTargets }
        'RefreshEvidence' { Invoke-RefreshEvidence }
        'ApproveAndGenerate' { Invoke-ApproveAndGenerate }
    }
    # 1 is left to PowerShell itself (for example a script blocked by execution policy).
    $code = if ($ok) { 0 } else { 3 }
    Write-Log $code $(if ($ok) { 'ok' } else { 'check failed or nothing written' })
    exit $code
}
catch {
    $m = $_.Exception.Message
    if ($m -match 'Access to the path .* is denied|UnauthorizedAccess') { $m += "`nFix: you need write access to the repository folder. Administrator rights are not needed; choose a clone you own, or close programs that lock these files, then rerun." }
    Write-Log 2 $m
    [Console]::Error.WriteLine("ERROR: $m`nLog: $LogFile")
    exit 2
}
