Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M5 {
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
$cb = [M5+EnumProc]{
    param($wnd, $l)
    $p = 0
    [void][M5]::GetWindowThreadProcessId($wnd, [ref]$p)
    if ($pids -contains [int]$p) {
        $sb = New-Object System.Text.StringBuilder 256
        [void][M5]::GetWindowTextW($wnd, $sb, 256)
        $t = $sb.ToString()
        if ($t.Length -gt 0 -and $t -notmatch 'GDI') { $script:ch = $wnd; return $false }
    }
    return $true
}
[void][M5]::EnumWindows($cb, [IntPtr]::Zero)
$hw = $script:ch
if ($hw -eq [IntPtr]::Zero) { Write-Output 'no window'; exit 1 }

[void][M5]::ShowWindow($hw, 9)
[void][M5]::SetForegroundWindow($hw)
Start-Sleep -Milliseconds 1200

$rect = New-Object M5+RECT
[void][M5]::GetWindowRect($hw, [ref]$rect)
$fw = [double]($rect.R - $rect.L)
$fh = [double]($rect.B - $rect.T)
[int]$accX = [double]$rect.L + ($fw * 0.500)
[int]$accY = [double]$rect.T + ($fh * 0.485)
[int]$pwdX = [int]$accX
[int]$pwdY = [double]$rect.T + ($fh * 0.524)
[int]$okX  = [double]$rect.L + ($fw * 0.582)
[int]$okY  = [double]$rect.T + ($fh * 0.498)
Write-Output "win=$($rect.L),$($rect.T) ${fw}x${fh}"
Write-Output "acc=($accX,$accY) pwd=($pwdX,$pwdY) ok=($okX,$okY)"

function ClickAt([int]$px, [int]$py) {
    [void][M5]::SetCursorPos($px, $py)
    Start-Sleep -Milliseconds 350
    [M5]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 100
    [M5]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 600
}

function TypeOne([string]$text) {
    foreach ($ch in $text.ToCharArray()) {
        [System.Windows.Forms.SendKeys]::SendWait($ch)
        Start-Sleep -Milliseconds 250
    }
}

ClickAt $accX $accY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{DEL}')
Start-Sleep -Milliseconds 400
TypeOne 'test123'
Start-Sleep -Milliseconds 900
Write-Output 'account typed'

# password box
ClickAt $pwdX $pwdY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{DEL}')
Start-Sleep -Milliseconds 400
TypeOne '177587'
Start-Sleep -Milliseconds 900
Write-Output 'password typed'
