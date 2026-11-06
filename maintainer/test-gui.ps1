<#
.SYNOPSIS
Real-window test of the setup window (PBI-Builder-Setup.ps1). Needs an interactive Windows desktop session.

.DESCRIPTION
Builds a temporary workspace, launches the real setup window from -Package under this computer's execution
policy, and drives it with UI Automation and window messages: manual path entry, the native Windows folder
picker (Folder box, address bar, New folder, Cancel), validation errors beside each path, Visual Studio and
VS Code, a fresh install, closing and reopening, an upgrade of two 5.6.0 installations (Install / Upgrade and
Upgrade ticked), Verify, Repair, Uninstall with its confirmation, and the unsaved-changes prompt. It checks that
the setup process shows one window (plus the picker or a confirmation while one is open), that the window
answers while the installer runs, and that no source repository file changes. Screenshots and a log are written
to -Out. Only the temporary folder is changed. The keyboard is used once (Alt+D, address bar) and only while the
picker is the foreground window; otherwise that step is reported NOT VERIFIED. The mouse is used twice (dragging a list
column divider and hovering a long path for its tooltip) and the cursor is put back. It also checks the list (rows
visible, columns, statuses after each step), the result summary and log, window sizes (larger, maximized, small) for
overlapping controls, and records the display scaling.

.EXAMPLE
powershell -NoProfile -STA -File test-gui.ps1 -Package <extracted package folder> -OldPackage <5.6.0 package folder> -Out <folder>
#>
param([Parameter(Mandatory = $true)][string]$Package, [Parameter(Mandatory = $true)][string]$OldPackage, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class GuiW {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
    [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")] static extern uint ThreadOf(IntPtr h, IntPtr pid);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h);
    [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr h, uint id, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object acc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    public static string ClassOf(IntPtr h) { StringBuilder s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
    // A WinForms button or check box ignores BM_CLICK without a real mouse over it, so press it through its accessibility
    // default action (what a screen reader does), on a background thread: a dialog the click opens blocks only that thread.
    public static void Press(IntPtr h) {
        System.Threading.Thread t = new System.Threading.Thread(delegate () {
            Guid g = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71"); object o;
            if (AccessibleObjectFromWindow(h, 0xFFFFFFFC, ref g, out o) == 0) o.GetType().InvokeMember("accDoDefaultAction", System.Reflection.BindingFlags.InvokeMethod, null, o, new object[] { 0 });
        });
        t.IsBackground = true; t.SetApartmentState(System.Threading.ApartmentState.MTA); t.Start();
    }
    // A WinForms check box is drawn by WinForms, so BM_GETCHECK does not report it; its accessibility state does (CHECKED 0x10).
    public static bool Checked(IntPtr h) {
        Guid g = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71"); object o;
        if (AccessibleObjectFromWindow(h, 0xFFFFFFFC, ref g, out o) != 0) throw new InvalidOperationException("no accessible object");
        return (Convert.ToInt32(o.GetType().InvokeMember("accState", System.Reflection.BindingFlags.GetProperty, null, o, new object[] { 0 })) & 0x10) != 0;
    }
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetAwarenessFromDpiAwarenessContext(IntPtr c);
    // One list cell (LVM_GETITEMTEXTW with the LVITEM and its text buffer in the list's process).
    public static string ListText(IntPtr list, int item, int sub) {
        uint pid; GetWindowThreadProcessId(list, out pid); IntPtr p = OpenProcess(0x0038, false, pid); UIntPtr n;
        IntPtr mem = VirtualAllocEx(p, IntPtr.Zero, (UIntPtr)4096u, 0x3000, 0x04);
        try {
            byte[] lv = new byte[88]; BitConverter.GetBytes(sub).CopyTo(lv, 8); BitConverter.GetBytes((long)mem + 256).CopyTo(lv, 24); BitConverter.GetBytes(1800).CopyTo(lv, 32);
            WriteProcessMemory(p, mem, lv, (UIntPtr)88u, out n);
            int len = (int)SendMsg(list, 0x1073, (IntPtr)item, mem);
            byte[] o = new byte[Math.Max(0, len) * 2]; if (len > 0) ReadProcessMemory(p, (IntPtr)((long)mem + 256), o, (UIntPtr)(uint)o.Length, out n);
            return Encoding.Unicode.GetString(o);
        } finally { VirtualFreeEx(p, mem, UIntPtr.Zero, 0x8000); CloseHandle(p); }
    }
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    // Visible top-level windows of a process, owned dialogs included (UI Automation shows owned dialogs under their owner).
    public static IntPtr[] TopWindows(int pid) {
        List<IntPtr> list = new List<IntPtr>();
        EnumWindows(delegate (IntPtr h, IntPtr l) { uint p; GetWindowThreadProcessId(h, out p); if ((int)p == pid && IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
        return list.ToArray();
    }
    // Moves the keyboard focus to a control of another process, as a click or Tab would.
    public static void Focus(IntPtr h) { uint t = ThreadOf(h, IntPtr.Zero), me = GetCurrentThreadId(); AttachThreadInput(me, t, true); try { SetFocus(h); } finally { AttachThreadInput(me, t, false); } }
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, string l);
    [DllImport("user32.dll", EntryPoint = "SendMessageW")] public static extern IntPtr SendMsg(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, StringBuilder l);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterWindowMessage(string s);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern IntPtr VirtualAllocEx(IntPtr p, IntPtr addr, UIntPtr size, uint type, uint protect);
    [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr p, IntPtr addr, UIntPtr size, uint type);
    [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr p, IntPtr addr, byte[] buf, UIntPtr size, out UIntPtr read);
    [DllImport("kernel32.dll")] static extern bool WriteProcessMemory(IntPtr p, IntPtr addr, byte[] buf, UIntPtr size, out UIntPtr written);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    public static string Text(IntPtr h) { int n = (int)SendMsg(h, 0x000E, IntPtr.Zero, IntPtr.Zero); StringBuilder sb = new StringBuilder(n + 1); SendMessage(h, 0x000D, (IntPtr)(n + 1), sb); return sb.ToString(); }
    // Sends msg with lParam pointing at a copy of input in the window's process, and returns that buffer afterwards.
    public static byte[] Remote(IntPtr h, uint msg, IntPtr w, byte[] input, out IntPtr result) {
        uint pid; GetWindowThreadProcessId(h, out pid); IntPtr p = OpenProcess(0x0038, false, pid); UIntPtr n;
        IntPtr mem = VirtualAllocEx(p, IntPtr.Zero, (UIntPtr)(uint)input.Length, 0x3000, 0x04);
        try { WriteProcessMemory(p, mem, input, (UIntPtr)(uint)input.Length, out n); result = SendMsg(h, msg, w, mem); byte[] o = new byte[input.Length]; ReadProcessMemory(p, mem, o, (UIntPtr)(uint)o.Length, out n); return o; }
        finally { VirtualFreeEx(p, mem, UIntPtr.Zero, 0x8000); CloseHandle(p); }
    }
    // WinForms answers WM_GETCONTROLNAME with Control.Name: the map from each control's Name to its window.
    public static Dictionary<string, IntPtr> Names(IntPtr top) {
        Dictionary<string, IntPtr> map = new Dictionary<string, IntPtr>(); uint msg = RegisterWindowMessage("WM_GETCONTROLNAME");
        EnumChildWindows(top, delegate (IntPtr h, IntPtr l) {
            IntPtr r; byte[] b = Remote(h, msg, (IntPtr)256, new byte[512], out r);
            if ((long)r > 0) { string s = Encoding.Unicode.GetString(b); int z = s.IndexOf('\0'); if (z >= 0) s = s.Substring(0, z); if (s.Length > 0 && !map.ContainsKey(s)) map[s] = h; }
            return true; }, IntPtr.Zero);
        return map;
    }
}
'@
[void][GuiW]::SetThreadDpiAwarenessContext([IntPtr](-1))   # DPI-unaware like the setup window: window rectangles and screenshots in its own pixels
$A = [System.Windows.Automation.AutomationElement]; $TS = [System.Windows.Automation.TreeScope]
$script:Fail = 0; $script:Lines = New-Object System.Collections.ArrayList
New-Item -ItemType Directory -Force -Path $Out | Out-Null
function Say([string]$kind, [string]$text) { $l = "$kind $text"; [void]$script:Lines.Add($l); Write-Host $l; if ($kind -eq 'FAIL:') { $script:Fail++ } }
function Check([bool]$ok, [string]$text) { if ($ok) { Say 'PASS:' $text } else { Say 'FAIL:' $text } }
function Wait-For([scriptblock]$probe, [string]$what, [int]$ms = 30000) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $ms) { try { $v = & $probe; if ($v) { return $v } } catch { }; Start-Sleep -Milliseconds 150 }
    throw "Timed out after $ms ms waiting for: $what"
}
# The PowerShell console window of the launch is not a setup window (double-clicking Install.cmd shows the cmd console too).
function Get-TopNames([int]$procId) { return (@(Get-Tops $procId | ForEach-Object { "$($_.Current.Name) [$($_.Current.ClassName)]" }) -join '; ') }
function Get-Tops([int]$procId) { return @([GuiW]::TopWindows($procId) | Where-Object { [GuiW]::ClassOf($_) -notmatch 'ConsoleWindowClass|PseudoConsoleWindow|tooltips_class32|SysShadow' } | ForEach-Object { $A::FromHandle($_) }) }
function Find-Top([int]$procId, [string]$like) { return @(Get-Tops $procId | Where-Object { $_.Current.Name -like $like })[0] }
function Find-Id($root, [string]$id) { return $root.FindFirst($TS::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, $id))) }
function Find-Raw($root, [scriptblock]$match) {
    $w = [System.Windows.Automation.TreeWalker]::RawViewWalker; $stack = New-Object System.Collections.Stack; $stack.Push($root)
    while ($stack.Count) { $e = $stack.Pop(); if (& $match $e.Current) { return $e }; $c = $w.GetFirstChild($e); while ($c) { $stack.Push($c); $c = $w.GetNextSibling($c) } }
    return $null
}
function Get-Hwnd($el) { if ($el -is [IntPtr]) { return $el }; return [IntPtr]$el.Current.NativeWindowHandle }
function Get-Value($el) { return [GuiW]::Text((Get-Hwnd $el)) }
function Test-Checked([string]$id) { return [GuiW]::Checked((Get-Ctl $id)) }
function Get-Cell([int]$i, [int]$col) { return [GuiW]::ListText((Get-Ctl 'InstallationList'), $i, $col) }
function Find-ListItem([string]$p) { $n = Get-ListCount; for ($i = 0; $i -lt $n; $i++) { if ((Get-Cell $i 0) -eq $p) { return $i } }; throw "not in the list: $p" }
function Get-ListState([string]$p) { $i = Find-ListItem $p; return (@(1..4 | ForEach-Object { Get-Cell $i $_ }) -join ' | ') }
# Every visible named control: no two with the same parent overlap, and none sticks out of its parent sideways.
function Test-Layout {
    $m = [GuiW]::Names($script:main); $items = @()
    foreach ($k in $m.Keys) { $h = $m[$k]; if (-not [GuiW]::IsWindowVisible($h)) { continue }; $r = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect($h, [ref]$r); if ($r.R -gt $r.L -and $r.B -gt $r.T) { $items += [pscustomobject]@{ name = $k; parent = [GuiW]::GetParent($h); r = $r } } }
    $bad = @()
    for ($i = 0; $i -lt $items.Count; $i++) {
        $a = $items[$i]; $pr = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect($a.parent, [ref]$pr)
        if ($a.parent -ne $script:main -and ($a.r.L -lt $pr.L - 1 -or $a.r.R -gt $pr.R + 1)) { $bad += "$($a.name) outside its parent" }
        for ($j = $i + 1; $j -lt $items.Count; $j++) { $b = $items[$j]; if ($a.parent -eq $b.parent -and $a.r.L -lt $b.r.R - 1 -and $b.r.L -lt $a.r.R - 1 -and $a.r.T -lt $b.r.B - 1 -and $b.r.T -lt $a.r.B - 1) { $bad += "$($a.name) overlaps $($b.name)" } }
    }
    return [pscustomobject]@{ count = $items.Count; problems = $bad }
}
function Resize-Main([int]$w, [int]$h) { [void][GuiW]::SetWindowPos($script:main, [IntPtr]::Zero, 0, 0, $w, $h, 0x16); Start-Sleep -Milliseconds 700 }   # NOMOVE | NOZORDER | NOACTIVATE
function Get-ListCount { return [int][GuiW]::SendMsg((Get-Ctl 'InstallationList'), 0x1004, [IntPtr]::Zero, [IntPtr]::Zero) }   # LVM_GETITEMCOUNT
function Test-Ticked([int]$i) { return (([int][GuiW]::SendMsg((Get-Ctl 'InstallationList'), 0x102C, [IntPtr]$i, [IntPtr]0xF000) -shr 12) -eq 2) }   # LVM_GETITEMSTATE, state image 2 = ticked
function Select-ListItem([int]$i) {
    # A real click on the row: its rectangle from LVM_GETITEMRECT (LVIR_LABEL), then mouse down and up at its centre.
    $l = Get-Ctl 'InstallationList'; $r = [IntPtr]::Zero; $b = [GuiW]::Remote($l, 0x100E, [IntPtr]$i, [byte[]](2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), [ref]$r)
    $x = [BitConverter]::ToInt32($b, 0) + 40; $y = ([BitConverter]::ToInt32($b, 4) + [BitConverter]::ToInt32($b, 12)) / 2
    $lp = [IntPtr](([int]$y -shl 16) -bor ([int]$x -band 0xFFFF))
    [void][GuiW]::PostMessage($l, 0x0201, [IntPtr]1, $lp); [void][GuiW]::PostMessage($l, 0x0202, [IntPtr]::Zero, $lp)
}
function Set-Text($el, [string]$text) { [void][GuiW]::SendMessage((Get-Hwnd $el), 0x000C, [IntPtr]::Zero, $text) }   # WM_SETTEXT
function Press-Enter($el) { [void][GuiW]::PostMessage((Get-Hwnd $el), 0x0100, [IntPtr]0x0D, [IntPtr]::Zero); [void][GuiW]::PostMessage((Get-Hwnd $el), 0x0101, [IntPtr]0x0D, [IntPtr]::Zero) }
# Leaves the field the way Tab does: focus it, then focus a button, so WinForms raises Leave.
function Commit($el) { [GuiW]::Focus((Get-Hwnd $el)); Start-Sleep -Milliseconds 150; [GuiW]::Focus((Get-Ctl 'ValidateButton')); Start-Sleep -Milliseconds 250 }
function Click($el) {
    $h = Get-Hwnd $el
    if ([GuiW]::ClassOf($h) -like 'WindowsForms10.*') { [GuiW]::Press($h) } else { [void][GuiW]::PostMessage($h, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) }   # native dialog button: BM_CLICK, posted
    Start-Sleep -Milliseconds 200
}
# Brings a window to the front. The Alt tap (needed to pass the foreground lock) is skipped when it is already in front:
# a second tap can leave the window in menu mode, which suppresses tooltips.
function Set-Front([IntPtr]$h) {
    if ([GuiW]::GetForegroundWindow() -eq $h) { return $true }
    [GuiW]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [GuiW]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero); [void][GuiW]::SetForegroundWindow($h); Start-Sleep -Milliseconds 300; return ([GuiW]::GetForegroundWindow() -eq $h)
}
function Shot($el, [string]$name) {
    $h = Get-Hwnd $el; $r = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect($h, [ref]$r)
    $bmp = New-Object System.Drawing.Bitmap ([Math]::Max(1, $r.R - $r.L)), ([Math]::Max(1, $r.B - $r.T)); $g = [System.Drawing.Graphics]::FromImage($bmp)
    $dc = $g.GetHdc(); [void][GuiW]::PrintWindow($h, $dc, 2); $g.ReleaseHdc($dc); $g.Dispose()
    $f = Join-Path $Out $name; $bmp.Save($f, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); Say 'SHOT:' $f
}
function Response-Ms([IntPtr]$h) { $sw = [Diagnostics.Stopwatch]::StartNew(); $res = [IntPtr]::Zero; $ok = [GuiW]::SendMessageTimeout($h, 0, [IntPtr]::Zero, [IntPtr]::Zero, 2, 5000, [ref]$res); if ($ok -eq [IntPtr]::Zero) { return 99999 }; return $sw.ElapsedMilliseconds }
function Get-Hashes([string]$dir) { $m = @{}; foreach ($f in Get-ChildItem -LiteralPath $dir -Recurse -File -Force) { $m[$f.FullName.Substring($dir.Length)] = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash }; return $m }
function Write-File([string]$p, [string]$text) { New-Item -ItemType Directory -Force -Path (Split-Path $p) | Out-Null; [System.IO.File]::WriteAllText($p, $text) }

# ---- Workspace (paths with spaces), package copy, and two 5.6.0 installations to upgrade ----
$T = Join-Path ([System.IO.Path]::GetTempPath()) ("Akzo GUI Test " + [guid]::NewGuid().ToString('N').Substring(0, 6))
$pkg = Join-Path $T 'package'; $homeDir = Join-Path $T 'home'; $src = Join-Path $T 'Sources'; $app = Join-Path $T 'App Repo'; $old1 = Join-Path $T 'Old Repo'; $old2 = Join-Path $T 'Old Repo 2'
New-Item -ItemType Directory -Force -Path $pkg, $homeDir, (Join-Path $app '.git'), (Join-Path $old1 '.git'), (Join-Path $old2 '.git') | Out-Null
foreach ($f in 'Install-PBIBuilder.ps1', 'PBI-Builder-Setup.ps1', 'pbi-builder-bundle.json', 'Akzo-SDD-PBI-Builder.html') { [System.IO.File]::WriteAllBytes((Join-Path $pkg $f), [System.IO.File]::ReadAllBytes((Join-Path $Package $f))) }
$csproj = { param($extra) "<Project Sdk=`"Microsoft.NET.Sdk`"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup>$extra</ItemGroup></Project>" }
Write-File "$src\Legacy CRM\Legacy.sln" 'Microsoft Visual Studio Solution File'; Write-File "$src\Legacy CRM\Plugins\Plugins.csproj" (& $csproj '<PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2" />'); Write-File "$src\Legacy CRM\Plugins\MeasurementPlugin.cs" 'public class MeasurementPlugin { }'
Write-File "$src\CDMS BL\Cdms.sln" 'Microsoft Visual Studio Solution File'; Write-File "$src\CDMS BL\Api\Api.csproj" (& $csproj '<PackageReference Include="MediatR" Version="12.0.0" />'); Write-File "$src\CDMS BL\Api\Handler.cs" 'public class Handler { }'
Write-File "$src\DAB BL\Dab.csproj" (& $csproj '<PackageReference Include="HotChocolate.AspNetCore" Version="13.0.0" />'); Write-File "$src\DAB BL\Query.cs" 'public class Query { }'
Write-File "$src\Shared UI\angular.json" '{ "projects": {} }'; Write-File "$src\Shared UI\src\app.component.ts" 'export class AppComponent { }'
Write-File "$src\Schema\schema.graphql" 'type Query { measurement: Int }'
Write-File "$src\Custom Ref\Rules.cs" 'public class Rules { }'
$oldEngine = Join-Path $OldPackage 'Install-PBIBuilder.ps1'
foreach ($o in @(@($old1, @('-Role', 'legacy', '-Ide', 'visualstudio')), @($old2, @('-Role', 'cdms', '-Ide', 'vscode', '-LegacySource', '..\Sources\Legacy CRM')))) {
    $r = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $oldEngine -RepoPath $o[0] @($o[1]) -AllowUpdates 2>&1
    if ($LASTEXITCODE -ne 0) { throw "5.6.0 install failed for $($o[0]): $r" }
}
Write-File "$old1\playbook\pbis\pbi-1-kept\pbi.json" '{ "kept": true }'
$before = Get-Hashes $src; $pbiBefore = (Get-FileHash -LiteralPath "$old1\playbook\pbis\pbi-1-kept\pbi.json").Hash
$version = ([System.IO.File]::ReadAllText((Join-Path $pkg 'pbi-builder-bundle.json')) | ConvertFrom-Json).packageVersion
Say 'INFO:' "package $version; workspace $T"

function Start-Setup {
    $p = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-STA', '-File', "`"$pkg\PBI-Builder-Setup.ps1`"", '-HomeRoot', "`"$homeDir`"") -PassThru
    $w = Wait-For { Find-Top $p.Id "Akzo SDD PBI Builder $version - Setup" } 'the setup window' 60000
    $script:main = Get-Hwnd $w
    Wait-For { $m = [GuiW]::Names($script:main); $m.ContainsKey('ProgressText') -and -not @($m.Keys | Where-Object { $_ -like '*Status' -and [GuiW]::Text($m[$_]) -eq 'Checking...' }).Count } 'startup validation' | Out-Null
    return @{ proc = $p; win = $w }
}
function Get-Ctl([string]$id) { $m = [GuiW]::Names($script:main); if (-not $m.ContainsKey($id)) { throw "no control named $id" }; return $m[$id] }
function Status([string]$id) { return [GuiW]::Text((Get-Ctl $id)) }
# The final status of a step: its progress line while it runs ends with '...'.
function Wait-Done([string]$like, [string]$what) { return (Wait-For { $s = Status 'ProgressText'; if ($s -like $like -and $s -notlike '*...') { $s } } $what) }
function Wait-Status([string]$id, [string]$like, [string]$what) { return (Wait-For { $s = Status $id; if ($s -like $like) { $s } } $what) }
function Wait-Dialog([string]$like) { return (Wait-For { Find-Top $script:proc.Id $like } "a window named $like") }
function Wait-Gone($el) { $h = Get-Hwnd $el; Wait-For { -not [GuiW]::IsWindow($h) -or -not @(Get-Tops $script:proc.Id | Where-Object { (Get-Hwnd $_) -eq $h }).Count } 'the dialog to close' | Out-Null }
# A native dialog button (picker or confirmation): BM_CLICK on it, then wait until the dialog window is gone.
function Answer($dialog, [string]$buttonId) { $b = Find-Raw $dialog { param($c) $c.AutomationId -eq $buttonId -and $c.ClassName -eq 'Button' }; Click $b; Wait-Gone $dialog }
function Dialog-Text($dialog) { return (Find-Raw $dialog { param($c) $c.AutomationId -eq '65535' }).Current.Name }
function Get-Json([string]$p) { return ([System.IO.File]::ReadAllText($p) | ConvertFrom-Json) }
$vsAgent = '.github\agents\akzo-sdd-pbi-builder.agent.md'; $codeAgent = '.github\agents\akzo-sdd-pbi-builder-vscode.agent.md'

try {
    # 1. Start: one window, the old popup and its button are gone.
    $s = Start-Setup; $script:proc = $s.proc; $script:w = $s.win; $main = $script:main
    Check ((Get-Tops $script:proc.Id).Count -eq 1) 'the setup process shows exactly one window at start'
    Check (-not (Find-Raw $script:w { param($c) $c.Name -like 'Repair / configure*' -or $c.Name -like 'Repositories for*' })) 'no "Repair / configure..." button and no repository pop-up'
    Check ((Status 'TargetsNote') -like 'CDMS, DAB and Shared Angular UI are independent implementation targets. UI is optional.*') 'the target note says CDMS, DAB and Shared Angular UI are independent and UI is optional'
    Check (-not (Find-Raw $script:w { param($c) $c.Name -like '*UI Only or Both*' })) 'no "CDMS + UI, DAB + UI, UI Only or Both" text'
    Check ((Status 'EditorVisualStudio') -eq 'Visual Studio 2026' -and (Status 'EditorVSCode') -eq 'Visual Studio Code') 'two editor checkboxes: Visual Studio 2026 and Visual Studio Code'
    $front = Set-Front $main; Say 'INFO:' "setup window in the foreground: $front"
    Shot $script:w '01-start.png'

    # 2. Manual entry of the install location (no picker).
    Set-Text (Get-Ctl 'LocationBox') $app; Commit (Get-Ctl 'LocationBox')
    Wait-Status 'LocationStatus' 'Not installed.*' 'location status' | Out-Null
    Check $true 'manual entry of the install location is accepted and validated (Not installed)'
    Check ((Get-Value (Get-Ctl 'LegacyBox')) -eq '') 'the Legacy source is not inferred from the install location'

    # 3. Native picker, Folder box: Legacy.
    Click (Get-Ctl 'LegacyBrowse'); $d = Wait-Dialog 'Select the Legacy CRM/XRM folder'
    $tops = Get-Tops $script:proc.Id
    Check ($tops.Count -eq 2 -and $d.Current.ClassName -eq '#32770') 'Browse opens one modal dialog, owned by the setup window'
    $isNative = (Find-Raw $d { param($c) $c.ClassName -eq 'DUIViewWndClassName' }) -and (Find-Raw $d { param($c) $c.ClassName -eq 'SysTreeView32' -and $c.Name -eq 'Navigation Pane' }) -and (Find-Raw $d { param($c) $c.ClassName -eq 'Address Band Root' }) -and (Find-Raw $d { param($c) $c.Name -eq 'New folder' }) -and (Find-Raw $d { param($c) $c.AutomationId -eq '1' -and $c.Name -eq 'Select Folder' })
    Check ([bool]$isNative) 'it is the Windows Explorer-style folder picker: address bar, navigation pane (folder hierarchy), New folder, Folder box, Select Folder'
    $tree = Find-Raw $d { param($c) $c.ClassName -eq 'SysTreeView32' }
    $items = [int](Wait-For { $n = [int][GuiW]::SendMsg((Get-Hwnd $tree), 0x1105, [IntPtr]::Zero, [IntPtr]::Zero); if ($n -gt 0) { $n } } 'navigation pane items' 10000)   # TVM_GETCOUNT
    Check ($items -gt 0) "its navigation pane (folder hierarchy) is populated: $items items (the screenshot shows This PC, the drives and Network)"
    Check ((Wait-For { Find-Raw $d { param($c) $c.ClassName -eq 'ToolbarWindow32' -and $c.Name -like 'Address: *' } } 'address bar').Current.Name -eq "Address: $T") 'an empty field opens the picker next to the install location'
    Shot $d '02-native-folder-picker.png'
    Set-Text (Find-Raw $d { param($c) $c.AutomationId -eq '1152' }) "$src\Legacy CRM"; Answer $d '1'
    Check ((Get-Value (Get-Ctl 'LegacyBox')) -eq "$src\Legacy CRM") 'the picker returns the full selected path (Folder box)'
    Check ((Wait-Status 'LegacyStatus' 'OK:*' 'Legacy status') -like 'OK: 1 solution(s), 1 project(s)*') 'the Legacy path is validated after confirmation (OK: 1 solution, 1 project)'

    # 4. Native picker, address bar; it opens beside the previously selected folder.
    Click (Get-Ctl 'CdmsBrowse'); $d = Wait-Dialog 'Select the CDMS BL folder'
    $crumb = Wait-For { Find-Raw $d { param($c) $c.ClassName -eq 'ToolbarWindow32' -and $c.Name -like 'Address: *' } } 'address bar'
    Check ($crumb.Current.Name -eq "Address: $src") "the picker remembers the previous folder and opens beside it ($($crumb.Current.Name))"
    $addressed = $false
    if (Set-Front (Get-Hwnd $d)) {
        try {
            [GuiW]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [GuiW]::keybd_event(0x44, 0, 0, [UIntPtr]::Zero); [GuiW]::keybd_event(0x44, 0, 2, [UIntPtr]::Zero); [GuiW]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
            $edit = Wait-For { Find-Raw (Find-Raw $d { param($c) $c.ClassName -eq 'Address Band Root' }) { param($c) $c.ClassName -eq 'Edit' } } 'the address bar edit box' 5000
            Set-Text $edit "$src\CDMS BL"; Shot $d '03-address-bar-entry.png'; Press-Enter $edit
            $addressed = [bool](Wait-For { Find-Raw $d { param($c) $c.ClassName -eq 'ToolbarWindow32' -and $c.Name -eq "Address: $src\CDMS BL" } } 'navigation by the address bar' 10000)
        }
        catch { Say 'INFO:' "address bar: $($_.Exception.Message)" }
    }
    if ($addressed) { Answer $d '1'; Check ((Get-Value (Get-Ctl 'CdmsBox')) -eq "$src\CDMS BL") 'a path typed in the picker address bar navigates there and Select Folder returns it' }
    else { Say 'NOT VERIFIED:' 'address bar entry (the picker could not be made the foreground window for Alt+D); the Folder box was used instead'; Set-Text (Find-Raw $d { param($c) $c.AutomationId -eq '1152' }) "$src\CDMS BL"; Answer $d '1' }
    Check ((Wait-Status 'CdmsStatus' 'OK:*' 'CDMS status') -like 'OK: 1 solution(s), 1 project(s)*') 'the CDMS path is validated'

    # 5. Native picker, New folder, then a name typed relative to the folder shown.
    Click (Get-Ctl 'DabBrowse'); $d = Wait-Dialog 'Select the DAB BL folder'
    $nf = Find-Raw $d { param($c) $c.Name -eq 'New folder' -and $c.ControlType.ProgrammaticName -eq 'ControlType.Button' }
    $ps = [powershell]::Create().AddScript({ param($e) ([System.Windows.Automation.InvokePattern]$e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke() }).AddArgument($nf); $h = $ps.BeginInvoke()
    $made = [bool](Wait-For { Test-Path -LiteralPath "$src\New folder" } 'New folder' 10000); [void]$ps.EndInvoke($h); $ps.Dispose()
    Check $made 'New folder in the picker creates a folder'
    Shot $d '04-picker-new-folder.png'
    $rename = Find-Raw (Find-Raw $d { param($c) $c.ClassName -eq 'DUIListView' }) { param($c) $c.ClassName -eq 'Edit' }
    if ($rename) { Press-Enter $rename; Start-Sleep -Milliseconds 500 }   # keep the default name; ends the rename
    Set-Text (Find-Raw $d { param($c) $c.AutomationId -eq '1152' }) 'DAB BL'; Answer $d '1'
    Check ((Get-Value (Get-Ctl 'DabBox')) -eq "$src\DAB BL") 'a folder name typed in the Folder box is returned as a full path'
    Wait-Status 'DabStatus' 'OK:*' 'DAB status' | Out-Null
    Remove-Item -LiteralPath "$src\New folder" -Recurse -Force

    # 6. Cancel keeps the field; manual entry for UI; invalid, missing and duplicate paths show their errors beside the field.
    Click (Get-Ctl 'UiBrowse'); $d = Wait-Dialog 'Select the Shared Angular UI folder'; Answer $d '2'
    Check ((Get-Value (Get-Ctl 'UiBox')) -eq '') 'Cancel in the picker leaves the path unchanged'
    # A network location: the same folder through the loopback administrative share, when this account may open it.
    $unc = '\\localhost\' + $src.Substring(0, 1) + '$' + $src.Substring(2) + '\Shared UI'
    if (Test-Path -LiteralPath $unc) {
        Click (Get-Ctl 'UiBrowse'); $d = Wait-Dialog 'Select the Shared Angular UI folder'
        Set-Text (Find-Raw $d { param($c) $c.AutomationId -eq '1152' }) $unc; Answer $d '1'
        Check ((Get-Value (Get-Ctl 'UiBox')) -eq $unc -and (Wait-Status 'UiStatus' 'OK:*' 'UNC status') -eq 'OK: Angular workspace') "a network (UNC) folder is selected and validated ($unc)"
    }
    else { Say 'NOT VERIFIED:' "network location: $unc is not reachable for this account (loopback administrative share), so no network folder was picked" }
    Set-Text (Get-Ctl 'UiBox') "$src\Shared UI"; Commit (Get-Ctl 'UiBox')
    Check ((Wait-Status 'UiStatus' 'OK:*' 'UI status') -eq 'OK: Angular workspace') 'manual entry of the Shared Angular UI path is validated'
    Set-Text (Get-Ctl 'SchemaBox') "$src\CDMS BL"; Commit (Get-Ctl 'SchemaBox')
    Check ((Wait-Status 'SchemaStatus' 'Error:*' 'schema error') -eq 'Error: same folder as CDMS BL') 'a folder used twice is reported beside the path'
    Set-Text (Get-Ctl 'Custom4Box') 'C:\bad<name'; Commit (Get-Ctl 'Custom4Box')
    Check ((Wait-Status 'Custom4Status' 'Error:*' 'custom error') -eq 'Error: remove < > " | ? * from the path') 'invalid characters are reported beside the path'
    Set-Text (Get-Ctl 'DabBox') "$src\No Such Folder"; Commit (Get-Ctl 'DabBox')
    Check ((Wait-Status 'DabStatus' 'Error:*' 'missing folder') -eq 'Error: folder not found') 'a missing folder is reported beside the path'
    Shot $script:w '05-validation-errors.png'
    Click (Get-Ctl 'InstallButton'); Start-Sleep -Milliseconds 800
    Check ((Get-Tops $script:proc.Id).Count -eq 1 -and (Status 'ProgressText') -like 'Not started: *') "Install / Upgrade refuses invalid paths without opening a dialog ($(Status 'ProgressText'))"
    Set-Text (Get-Ctl 'DabBox') "$src\DAB BL"; Commit (Get-Ctl 'DabBox')
    Set-Text (Get-Ctl 'SchemaBox') "$src\Schema"; Commit (Get-Ctl 'SchemaBox')
    Set-Text (Get-Ctl 'Custom4Box') "$src\Custom Ref"; Commit (Get-Ctl 'Custom4Box')
    Check ((Wait-Status 'SchemaStatus' 'OK:*' 'schema OK') -eq 'OK: 1 .graphql file(s)') 'the GraphQL schema folder is validated (1 .graphql file)'
    Check ((Wait-Status 'Custom4Status' 'OK:*' 'custom OK') -eq 'OK: readable') 'the custom reference is validated'

    # 7. Editors: at least one; then both, installed in the background while the window keeps answering.
    Check ((Test-Checked 'EditorVisualStudio') -and -not (Test-Checked 'EditorVSCode')) 'a new installation starts with Visual Studio 2026 ticked'
    Click (Get-Ctl 'EditorVisualStudio'); Start-Sleep -Milliseconds 300
    Check (-not (Test-Checked 'EditorVisualStudio') -and (Status 'EditorStatus') -eq 'Error: select at least one editor.') 'no editor ticked: the error is shown beside the editors'
    Click (Get-Ctl 'InstallButton'); Start-Sleep -Milliseconds 800
    Check ((Status 'ProgressText') -eq 'Not started: Editor: select at least one editor.' -and (Get-Tops $script:proc.Id).Count -eq 1) 'Install / Upgrade needs at least one editor'
    Click (Get-Ctl 'EditorVisualStudio'); Click (Get-Ctl 'EditorVSCode'); Start-Sleep -Milliseconds 300
    Check ((Test-Checked 'EditorVisualStudio') -and (Test-Checked 'EditorVSCode')) 'both editors can be ticked together'
    Check ((Status 'EditorStatus') -eq 'Visual Studio 2026: not installed; Install / Upgrade adds it. VS Code: not installed; Install / Upgrade adds it.') "the status is shown per editor ($(Status 'EditorStatus'))"
    Click (Get-Ctl 'InstallButton')
    Wait-Status 'ProgressText' 'Step 1 of 3: previewing the changes*' 'preview progress' | Out-Null
    $ms = @(1..5 | ForEach-Object { Response-Ms $main; Start-Sleep -Milliseconds 100 })
    Check (($ms | Measure-Object -Maximum).Maximum -lt 1000) "the window answers while the installer previews in the background (response times $($ms -join ', ') ms)"
    Shot $script:w '06-progress.png'
    $d = Wait-Dialog 'Install / Upgrade' ; Shot $d '07-confirm-planned-changes.png'
    Check ((Dialog-Text $d) -like "Planned changes in $app*akzo-sdd-pbi-builder-vscode.agent.md*Apply them?*") 'Install / Upgrade asks before writing and lists the planned changes, including the VS Code agent'
    Answer $d '6'
    $done = Wait-Status 'ProgressText' 'Done:*' 'install finished'
    Check ($done -like "Done: $version is installed in $app (Visual Studio 2026 installed; VS Code installed). Verified: all * recorded files match.") "success is reported only after Verify: $done"
    Check ((Get-ListState $app) -eq "$version | Visual Studio 2026 + VS Code | Installed | None") "the list is refreshed at once: $(Get-ListState $app)"
    $sum = Status 'Summary'
    Check ($sum -like "Target repository: $app*Result: $version installed. Verified: all * recorded files match.*Files: * installed, 0 updated, 0 retired, * preserved*, 0 backed up, 0 failed.*Editor configurations:*Visual Studio 2026: .github/agents/akzo-sdd-pbi-builder.agent.md (create)*VS Code: .github/agents/akzo-sdd-pbi-builder-vscode.agent.md (create)*") "the summary lists target, verification, file counts and both editor configurations"
    Say 'INFO:' ("summary: " + ($sum -replace "\r?\n", ' / '))
    Check (-not [GuiW]::IsWindowVisible((Get-Ctl 'Log')) -and (Status 'LogToggleButton') -eq 'Show log') 'the detailed log is collapsed by default'
    Click (Get-Ctl 'LogToggleButton'); Start-Sleep -Milliseconds 500
    Check ([GuiW]::IsWindowVisible((Get-Ctl 'Log')) -and (Status 'LogToggleButton') -eq 'Hide log' -and (Get-Value (Get-Ctl 'Log')) -match 'Verify passed') 'Show log expands the detailed log (installer output and the Verify result)'
    $lay = Test-Layout; Check (-not $lay.problems.Count) "no overlapping controls with the log shown ($($lay.count) controls; $($lay.problems -join ', '))"
    Shot $script:w '08b-log-expanded.png'
    Click (Get-Ctl 'LogToggleButton'); Start-Sleep -Milliseconds 300
    $cfg = Get-Json "$app\playbook\pbi-builder\config.json"
    Check ($cfg.ide -eq 'both' -and $cfg.role -eq 'other') "config.json: ide both, role other (no Legacy inferred from the install location)"
    Check ((Test-Path -LiteralPath "$app\$vsAgent") -and (Test-Path -LiteralPath "$app\$codeAgent") -and @(Get-ChildItem -LiteralPath "$app\playbook" -Directory).Count -eq 1) 'both agents installed, one shared playbook folder'
    Check ($cfg.sources.legacy -eq '../Sources/Legacy CRM' -and $cfg.sources.cdms -eq '../Sources/CDMS BL' -and $cfg.sources.dab -eq '../Sources/DAB BL' -and $cfg.sources.ui -eq '../Sources/Shared UI') 'config.json: the four source paths, relative to the installation'
    Check ((@($cfg.others | ForEach-Object { "$($_.name)=$($_.path)" }) -join ';') -eq 'GraphQL Schema=../Sources/Schema;Custom Ref=../Sources/Custom Ref') 'config.json: the GraphQL schema and the custom reference'
    Check ((Get-Tops $script:proc.Id).Count -eq 1) "one window after the install ($(Get-TopNames $script:proc.Id))"
    Shot $script:w '08-installed-both-editors.png'

    # 8. Close and reopen: the installation, both editors and every path are shown again.
    Click (Get-Ctl 'CloseButton'); $closed = $script:proc.WaitForExit(15000)
    Check $closed 'Close exits when nothing is unsaved'
    $plain = Join-Path $T 'Plain Repo'; New-Item -ItemType Directory -Force -Path (Join-Path $plain '.git') | Out-Null; $gone = Join-Path $T 'Gone Repo'
    $long = Join-Path $T ('Long path ' + ('a' * 45) + '\' + ('b' * 45) + '\' + ('c' * 40) + '\Repository with a long name'); New-Item -ItemType Directory -Force -Path (Join-Path $long '.git') | Out-Null
    Add-Content -LiteralPath (Join-Path $homeDir '.akzo-pbi-builder\repositories.txt') -Value @($old1, $old2, $plain, $long, $gone)
    $s = Start-Setup; $script:proc = $s.proc; $script:w = $s.win; $main = $script:main; [void](Set-Front $main)
    Check ((Get-Value (Get-Ctl 'LocationBox')) -eq $app) 'reopening shows the last installation'
    $paths = @('LegacyBox', 'CdmsBox', 'DabBox', 'UiBox', 'SchemaBox', 'Custom4Box' | ForEach-Object { Get-Value (Get-Ctl $_) })
    Check (($paths -join '|') -eq (@("$src\Legacy CRM", "$src\CDMS BL", "$src\DAB BL", "$src\Shared UI", "$src\Schema", "$src\Custom Ref") -join '|')) 'every path persists after closing and reopening'
    Check ((Status 'Custom4Label') -eq 'Custom Ref') 'the custom reference keeps its name'
    Check ((Test-Checked 'EditorVisualStudio') -and (Test-Checked 'EditorVSCode')) 'both editor selections persist'
    Check ((Status 'EditorStatus') -eq 'Visual Studio 2026: installed, up to date. VS Code: installed, up to date.') "each editor's status is detected ($(Status 'EditorStatus'))"
    Check ((Get-ListCount) -eq 6) 'the list shows the six remembered installations'
    $perPage = [int][GuiW]::SendMsg((Get-Ctl 'InstallationList'), 0x1028, [IntPtr]::Zero, [IntPtr]::Zero)   # LVM_GETCOUNTPERPAGE
    Check ($perPage -ge 6 -and $perPage -le 9) "the list shows $perPage full rows without scrolling (6 to 8 required)"
    $hdr = @(0..4 | ForEach-Object { [int][GuiW]::SendMsg((Get-Ctl 'InstallationList'), 0x101D, [IntPtr]$_, [IntPtr]::Zero) })   # LVM_GETCOLUMNWIDTH
    $lr = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect((Get-Ctl 'InstallationList'), [ref]$lr)
    $sum = ($hdr | Measure-Object -Sum).Sum
    Check ($hdr[0] -ge 360 -and $sum -le ($lr.R - $lr.L) -and -not ([GuiW]::GetWindowLong((Get-Ctl 'InstallationList'), -16) -band 0x00100000)) "the location column takes the free width ($($hdr[0]) px of $($lr.R - $lr.L)) so version, editors, status and required stay in view"
    Shot $script:w '09a-list-statuses-in-view.png'
    # A real mouse drag of the location column's divider, 500 px to the right (the cursor is put back): the list then scrolls
    # sideways and keeps that width when it refreshes. (The list ignores a width set from outside, so the test drags.)
    $lv = Get-Ctl 'InstallationList'; $col = { [int][GuiW]::SendMsg($lv, 0x101D, [IntPtr]0, [IntPtr]::Zero) }; $w0 = & $col
    $hdrWnd = [GuiW]::FindWindowEx($lv, [IntPtr]::Zero, 'SysHeader32', $null); $hr = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect($hdrWnd, [ref]$hr)
    $was = New-Object GuiW+POINT; [void][GuiW]::GetCursorPos([ref]$was); [void](Set-Front $main)
    $x = $hr.L + $w0; $y = $hr.T + 8; [void][GuiW]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 150; [GuiW]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 100
    for ($d = 25; $d -le 500; $d += 25) { [void][GuiW]::SetCursorPos($x + $d, $y); Start-Sleep -Milliseconds 15 }
    [GuiW]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 300; [void][GuiW]::SetCursorPos($was.X, $was.Y)
    $w1 = & $col
    Check ($w1 -ge $w0 + 400 -and ([GuiW]::GetWindowLong($lv, -16) -band 0x00100000)) "dragging the location column wider ($w0 -> $w1 px) shows more of a long path and the list scrolls sideways (WS_HSCROLL)"
    Click (Get-Ctl 'ValidateButton'); Start-Sleep -Milliseconds 600
    Check ((& $col) -eq $w1) "the dragged width is kept when the list refreshes ($(& $col) px)"
    Shot $script:w '09c-long-path-scrolled.png'
    foreach ($p in @(@($app, "$version | Visual Studio 2026 + VS Code | Installed | None"), @($old1, '5.6.0 | Visual Studio 2026 | Upgrade Available | Upgrade'), @($old2, '5.6.0 | VS Code | Upgrade Available | Upgrade'), @($plain, '- | - | Not Installed | Install'), @($long, '- | - | Not Installed | Install'), @($gone, '- | - | Not Found | Fix path'))) {
        Check ((Get-ListState $p[0]) -eq $p[1]) "list row $(Split-Path -Leaf $p[0]): $(Get-ListState $p[0])"
    }
    # Hover over the long path: a real mouse move (the cursor is put back), then the tooltip window must show the full path.
    $i = Find-ListItem $long; $r = [IntPtr]::Zero; $b = [GuiW]::Remote((Get-Ctl 'InstallationList'), 0x100E, [IntPtr]$i, [byte[]](2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), [ref]$r)
    $pt = New-Object GuiW+POINT; $pt.X = [BitConverter]::ToInt32($b, 0) + 40; $pt.Y = ([BitConverter]::ToInt32($b, 4) + [BitConverter]::ToInt32($b, 12)) / 2; [void][GuiW]::ClientToScreen((Get-Ctl 'InstallationList'), [ref]$pt)
    $was = New-Object GuiW+POINT; [void][GuiW]::GetCursorPos([ref]$was); [void](Set-Front $main)
    $lr2 = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect($lv, [ref]$lr2); [void][GuiW]::SetCursorPos($pt.X, $lr2.T - 40); Start-Sleep -Milliseconds 300   # from outside the list, so it sees the mouse enter
    foreach ($step in 3, 2, 1, 0) { [void][GuiW]::SetCursorPos($pt.X - 4 * $step, $pt.Y); Start-Sleep -Milliseconds 60 }
    $tip = $null; try { $tip = Wait-For { @([GuiW]::TopWindows($script:proc.Id) | Where-Object { [GuiW]::ClassOf($_) -eq 'tooltips_class32' -and [GuiW]::Text($_) -like "$long*" })[0] } 'the tooltip' 6000 } catch { }
    if ($tip) { Shot $tip '09b-tooltip-full-path.png' }
    [void][GuiW]::SetCursorPos($was.X, $was.Y)
    Check ([bool]$tip) 'hovering a truncated path shows the full path in a tooltip'
    Check ((Get-Tops $script:proc.Id).Count -eq 1) "one window after reopening ($(Get-TopNames $script:proc.Id))"
    Shot $script:w '09-reopened-with-older-installations.png'

    # 9. One editor blocked: its edited agent file is reported on its own; the other editor is upgraded alone; Verify and Repair per editor.
    Add-Content -LiteralPath "$app\$codeAgent" -Value 'My VS Code notes.'
    Click (Get-Ctl 'ValidateButton'); Start-Sleep -Milliseconds 500
    Check ((Status 'EditorStatus') -eq 'Visual Studio 2026: installed, up to date. VS Code: agent file edited (never overwritten).') 'an edited VS Code agent is shown for VS Code only'
    Set-Text (Get-Ctl 'Custom4Box') ''; Commit (Get-Ctl 'Custom4Box')
    Click (Get-Ctl 'InstallButton'); $d = Wait-Dialog 'Install / Upgrade'; Shot $d '10-one-editor-blocked.png'
    Check ((Dialog-Text $d) -like 'VS Code cannot be updated: its agent file was edited*Install / upgrade Visual Studio 2026 only? VS Code stays as it is.') 'the blocked editor is reported separately, with the option to upgrade the other editor alone'
    Answer $d '6'
    $done = Wait-Status 'ProgressText' 'Done:*' 'Visual Studio only'
    Check ($done -like '*(Visual Studio 2026 installed; VS Code not changed). Verification: * 0 missing, 1 changed*') "only Visual Studio 2026 is reported installed, and Verify reports the edited VS Code file ($done)"
    Check ((Get-Content -LiteralPath "$app\$codeAgent" -Raw) -match 'My VS Code notes' -and @((Get-Json "$app\playbook\pbi-builder\config.json").others).Count -eq 1) 'the edited VS Code agent is kept; the other settings are saved'
    Click (Get-Ctl 'VerifyButton')
    Check ((Wait-Done 'Verify *' 'verify per editor') -eq 'Verify stopped: Visual Studio 2026 OK; VS Code CHANGED. See the log.') 'Verify reports each editor separately'
    Remove-Item -LiteralPath "$app\$vsAgent"
    Click (Get-Ctl 'RepairButton')
    Check ((Wait-Status 'ProgressText' 'Repair:*' 'repair per editor') -eq 'Repair: Visual Studio 2026 repaired; VS Code NOT repaired. See the log.') 'Repair runs per editor: Visual Studio 2026 is repaired although VS Code is blocked'
    Check ((Get-ListState $app) -like '* | Failed | Retry') "a step that did not finish shows Failed: $(Get-ListState $app)"
    Check (Test-Path -LiteralPath "$app\$vsAgent") 'the missing Visual Studio agent is restored'
    Remove-Item -LiteralPath "$app\$codeAgent"
    Click (Get-Ctl 'RepairButton'); Check ((Wait-Status 'ProgressText' 'Repair:*' 'repair both') -eq 'Repair: Visual Studio 2026 repaired; VS Code repaired. See the log.') 'Repair restores the VS Code agent on its own'
    Check ((Get-ListState $app) -like '* | Installed | None') "after a successful repair the list shows Installed again: $(Get-ListState $app)"
    Click (Get-Ctl 'VerifyButton'); Check ((Wait-Done 'Verify *' 'verify both') -eq 'Verify finished: Visual Studio 2026 OK; VS Code OK. See the log.') 'both editors verify'
    Shot $script:w '11-both-editors-verified.png'

    # 10. Upgrade one 5.6.0 installation with Install / Upgrade: its settings (role legacy, Visual Studio only) are shown and kept.
    Select-ListItem (Find-ListItem $old1)
    Wait-For { (Get-Value (Get-Ctl 'LocationBox')) -eq $old1 } 'Old Repo opened by clicking it in the list' | Out-Null
    Check ((Status 'LocationStatus') -like "Installed: 5.6.0. Install / Upgrade updates it to $version*") 'the installed version is detected for the selected installation'
    Check ((Get-Value (Get-Ctl 'LegacyBox')) -eq $old1 -and (Wait-Status 'LegacyStatus' '*(the install location)' 'role legacy') -like '*(the install location)') 'a saved Legacy role is shown as the install location (not inferred)'
    Check ((Test-Checked 'EditorVisualStudio') -and -not (Test-Checked 'EditorVSCode')) 'its Visual Studio only setting is shown'
    Check ((Status 'EditorStatus') -eq 'Visual Studio 2026: installed (5.6.0), update available. VS Code: not installed.') "its editor status ($(Status 'EditorStatus'))"
    Click (Get-Ctl 'InstallButton'); $d = Wait-Dialog 'Install / Upgrade'; Answer $d '6'
    Wait-Status 'ProgressText' 'Done:*' 'upgrade finished' | Out-Null
    $c1 = Get-Json "$old1\playbook\pbi-builder\config.json"; $m1 = Get-Json "$old1\playbook\pbi-builder\installed-files.json"
    Check ($m1.packageVersion -eq $version -and $c1.role -eq 'legacy' -and $c1.ide -eq 'visualstudio' -and $c1.sources.legacy -eq '.' -and -not (Test-Path -LiteralPath "$old1\$codeAgent")) "Install / Upgrade upgrades 5.6.0 to $version for Visual Studio only and keeps its settings"
    Check ((Get-ListState $old1) -eq "$version | Visual Studio 2026 | Installed | None") "the list shows the upgrade at once: $(Get-ListState $old1)"
    Check ((Get-FileHash -LiteralPath "$old1\playbook\pbis\pbi-1-kept\pbi.json").Hash -eq $pbiBefore) 'existing PBIs are kept by the upgrade'

    # 11. Upgrade ticked: the other 5.6.0 installation (VS Code), ticked automatically.
    Check ((Status 'UpgradeTickedButton') -eq 'Upgrade ticked (1)' -and (Test-Ticked (Find-ListItem $old2)) -and -not (Test-Ticked (Find-ListItem $old1))) 'only the remaining older installation is ticked'
    Click (Get-Ctl 'UpgradeTickedButton'); $d = Wait-Dialog 'Upgrade ticked'; Answer $d '6'
    Check ((Wait-Status 'ProgressText' 'Upgrade finished*' 'upgrade ticked') -eq 'Upgrade finished: 1 of 1 upgraded. See the log.') 'Upgrade ticked upgrades the ticked installation'
    Check ((Get-ListState $old2) -eq "$version | VS Code | Installed | None") "the list shows it installed and verified: $(Get-ListState $old2)"
    $c2 = Get-Json "$old2\playbook\pbi-builder\config.json"
    Check ((Get-Json "$old2\playbook\pbi-builder\installed-files.json").packageVersion -eq $version -and $c2.role -eq 'cdms' -and $c2.ide -eq 'vscode' -and $c2.sources.legacy -eq '../Sources/Legacy CRM') 'it keeps that installation''s role, VS Code editor and paths'

    # 12. Verify, Repair (one editor), Uninstall (confirmation; No changes nothing, Yes removes it).
    Click (Get-Ctl 'VerifyButton'); Check ((Wait-Done 'Verify *' 'verify') -eq 'Verify finished: Visual Studio 2026 OK. See the log.' -and (Get-Value (Get-Ctl 'Log')) -match 'All recorded files match') 'Verify works on the selected installation'
    Click (Get-Ctl 'RepairButton'); Check ((Wait-Done 'Repair *' 'repair') -eq 'Repair finished. See the log.') 'Repair works on the selected installation'
    Select-ListItem (Find-ListItem $old2)
    Wait-For { (Get-Value (Get-Ctl 'LocationBox')) -eq $old2 } 'Old Repo 2 opened' | Out-Null
    Click (Get-Ctl 'UninstallButton'); $d = Wait-Dialog 'Uninstall'; Shot $d '12-uninstall-confirmation.png'; Answer $d '7'
    Check (Test-Path -LiteralPath "$old2\playbook\pbi-builder\installed-files.json") 'Uninstall asks first; No changes nothing'
    Click (Get-Ctl 'UninstallButton'); $d = Wait-Dialog 'Uninstall'; Answer $d '6'
    Wait-Done 'Uninstall *' 'uninstall' | Out-Null
    Check (-not (Test-Path -LiteralPath "$old2\playbook\pbi-builder\installed-files.json") -and -not (@(Get-Content -LiteralPath (Join-Path $homeDir '.akzo-pbi-builder\repositories.txt')) -contains $old2)) 'Uninstall with Yes removes it and forgets the location'

    # 13. Unsaved changes: closing asks; No keeps the window open.
    # Window sizes: larger, maximized and small; no control may overlap another (DPI: this machine's scaling, see INFO).
    $applied = (Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name AppliedDPI -ErrorAction SilentlyContinue).AppliedDPI
    Say 'INFO:' "display scaling: $(if ($applied) { [int]($applied * 100 / 96) } else { 'unknown' })% (AppliedDPI $applied); the setup window's DPI awareness: $([GuiW]::GetAwarenessFromDpiAwarenessContext([GuiW]::GetWindowDpiAwarenessContext($main))) (0 = unaware: Windows scales the whole window)"
    foreach ($size in @(@(1000, 740, '13-resized-1000x740.png'), @(1400, 950, '14-resized-1400x950.png'))) {
        Resize-Main $size[0] $size[1]; $lay = Test-Layout
        Check (-not $lay.problems.Count) "resized to $($size[0]) x $($size[1]): no overlapping controls ($($lay.count) controls checked$(if ($lay.problems.Count) { ': ' + ($lay.problems -join ', ') }))"
        Shot $script:w $size[2]
    }
    $locBefore = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect((Get-Ctl 'LocationBox'), [ref]$locBefore)
    [void][GuiW]::ShowWindow($main, 3); Start-Sleep -Milliseconds 900; $lay = Test-Layout; $locAfter = New-Object GuiW+RECT; [void][GuiW]::GetWindowRect((Get-Ctl 'LocationBox'), [ref]$locAfter)
    Check (-not $lay.problems.Count -and ($locAfter.R - $locAfter.L) -gt ($locBefore.R - $locBefore.L)) "maximized: the fields widen ($($locBefore.R - $locBefore.L) -> $($locAfter.R - $locAfter.L) px) and nothing overlaps$(if ($lay.problems.Count) { ': ' + ($lay.problems -join ', ') })"
    Shot $script:w '15-maximized.png'
    [void][GuiW]::ShowWindow($main, 9); Start-Sleep -Milliseconds 600
    Resize-Main 800 560; $lay = Test-Layout
    Check (-not $lay.problems.Count -and ([GuiW]::GetWindowLong($main, -16) -band 0x00200000)) "a small window scrolls (WS_VSCROLL) instead of overlapping controls$(if ($lay.problems.Count) { ': ' + ($lay.problems -join ', ') })"
    Shot $script:w '16-small-window-scrolls.png'
    Resize-Main 1120 830
    Select-ListItem (Find-ListItem $app)
    Wait-For { (Get-Value (Get-Ctl 'LocationBox')) -eq $app } 'App Repo opened' | Out-Null
    Set-Text (Get-Ctl 'CdmsBox') "$src\DAB BL\..\CDMS BL\Api"; Commit (Get-Ctl 'CdmsBox'); Start-Sleep -Milliseconds 500
    Click (Get-Ctl 'CloseButton'); $d = Wait-Dialog 'Setup'
    Check ((Dialog-Text $d) -like "The paths shown for $app are not saved.*") 'closing with unsaved paths asks first'
    Answer $d '7'; Start-Sleep -Milliseconds 500
    Check (-not $script:proc.HasExited -and (Get-Tops $script:proc.Id).Count -eq 1) 'No keeps the window open'
    Click (Get-Ctl 'CloseButton'); $d = Wait-Dialog 'Setup'; Answer $d '6'
    Check ($script:proc.WaitForExit(15000)) 'Yes closes it'
    Check (((Get-Json "$app\playbook\pbi-builder\config.json").sources.cdms) -eq '../Sources/CDMS BL') 'a discarded change is not saved'

    # 14. No source repository file changed.
    $after = Get-Hashes $src
    Check (($before.Keys.Count -eq $after.Keys.Count) -and -not @($before.Keys | Where-Object { $after[$_] -ne $before[$_] }).Count) "no file in the source repositories changed ($($before.Keys.Count) files compared)"
}
catch { Say 'FAIL:' "stopped: $($_.Exception.Message)"; try { if ($script:w) { Shot $script:w 'zz-failure.png' } } catch { } }
finally {
    if ($script:proc -and -not $script:proc.HasExited) { Stop-Process -Id $script:proc.Id -Force }
    Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
    Say 'RESULT:' $(if ($script:Fail) { "$($script:Fail) check(s) failed" } else { 'all checks passed' })
    [System.IO.File]::WriteAllLines((Join-Path $Out 'gui-test-log.txt'), [string[]]$script:Lines)
}
exit $script:Fail
