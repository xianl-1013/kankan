Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M3 {
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
$script:ch = [IntPtr]::Zero
$cb = [M3+EnumProc]{
    param($w, $l)
    $p = 0
    [void][M3]::GetWindowThreadProcessId($w, [ref]$p)
    if ($pids -contains [int]$p) {
        $sb = New-Object System.Text.StringBuilder 256
        [void][M3]::GetWindowTextW($w, $sb, 256)
        $t = $sb.ToString()
        if ($t.Length -gt 0 -and $t -notmatch 'GDI') { $script:ch = $w; return $false }
    }
    return $true
}
[void][M3]::EnumWindows($cb, [IntPtr]::Zero)
$h = $script:ch
if ($h -eq [IntPtr]::Zero) { Write-Output 'no window'; exit 1 }

[void][M3]::ShowWindow($h, 9)
[void][M3]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 900

$r = New-Object M3+RECT
[void][M3]::GetWindowRect($h, [ref]$r)
$winW = $r.R - $r.L; $winH = $r.B - $r.T
Write-Output "window rect=$($r.L),$($r.T),$($r.R),$($r.B) size=${winW}x${winH}"

# 登录框位置：按窗口尺寸按比例换算（显式整数运算）
$fw = [double]$winW
$fh = [double]$winH
$fl = [double]$r.L
$ft = [double]$r.T
[int]$accX = $fl + ($fw * 0.507)
[int]$accY = $ft + ($fh * 0.479)
[int]$pwdX = $accX
[int]$pwdY = $ft + ($fh * 0.524)
[int]$okX = $fl + ($fw * 0.591)
[int]$okY = $accY
Write-Output "acc=($accX,$accY) pwd=($pwdX,$pwdY) ok=($okX,$okY)"

function Click($x, $y) {
    [void][M3]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 250
    [M3]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [M3]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 400
}
function TypeSlow($text) {
    foreach ($c in $text.ToCharArray()) {
        [System.Windows.Forms.SendKeys]::SendWait($c)
        Start-Sleep -Milliseconds 100
    }
}

Click $accX $accY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 300
TypeSlow 'test123'
Start-Sleep -Milliseconds 600

# 自绘 UI 不认 TAB，必须点密码框
Click $pwdX $pwdY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 300
TypeSlow '177587'
Start-Sleep -Milliseconds 700

Click $okX $okY
Write-Output 'login submitted'
Start-Sleep -Seconds 8
