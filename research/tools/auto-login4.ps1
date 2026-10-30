Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M4 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder sb, int n);
    public struct RECT { public int L, T, R, B; }
    public delegate bool EnumProc(IntPtr h, IntPtr l);
}
"@
Add-Type -AssemblyName System.Windows.Forms

$pids = @(Get-Process Client -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
if ($pids.Count -eq 0) { Write-Output 'client not running'; exit 1 }

$script:ch = [IntPtr]::Zero
$cb = [M4+EnumProc]{
    param($wnd, $l)
    $p = 0
    [void][M4]::GetWindowThreadProcessId($wnd, [ref]$p)
    if ($pids -contains [int]$p) {
        $sb = New-Object System.Text.StringBuilder 256
        [void][M4]::GetWindowTextW($wnd, $sb, 256)
        $t = $sb.ToString()
        if ($t.Length -gt 0 -and $t -notmatch 'GDI') { $script:ch = $wnd; return $false }
    }
    return $true
}
[void][M4]::EnumWindows($cb, [IntPtr]::Zero)
$hw = $script:ch
if ($hw -eq [IntPtr]::Zero) { Write-Output 'no window'; exit 1 }

[void][M4]::ShowWindow($hw, 9)
[void][M4]::SetForegroundWindow($hw)
Start-Sleep -Milliseconds 1000

$rect = New-Object M4+RECT
[void][M4]::GetWindowRect($hw, [ref]$rect)
$fw = [double]($rect.R - $rect.L)
$fh = [double]($rect.B - $rect.T)
[int]$accX = [double]$rect.L + ($fw * 0.507)
[int]$accY = [double]$rect.T + ($fh * 0.479)
[int]$pwdY = [double]$rect.T + ($fh * 0.524)
[int]$okX  = [double]$rect.L + ($fw * 0.591)
Write-Output "win=$($rect.L),$($rect.T) ${fw}x${fh} acc=($accX,$accY) pwd=($accX,$pwdY) ok=($okX,$accY)"

function ClickAt([int]$px, [int]$py) {
    [void][M4]::SetCursorPos($px, $py)
    Start-Sleep -Milliseconds 300
    [M4]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 80
    [M4]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 500
}

function PasteText([string]$text) {
    Set-Clipboard -Value $text
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 700
}

# 账号
ClickAt $accX $accY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('{DEL}')
Start-Sleep -Milliseconds 300
PasteText 'test123'

# 密码
ClickAt $accX $pwdY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('{DEL}')
Start-Sleep -Milliseconds 300
PasteText '177587'

Start-Sleep -Milliseconds 500
ClickAt $okX $accY
Write-Output 'login submitted'
Start-Sleep -Seconds 8
