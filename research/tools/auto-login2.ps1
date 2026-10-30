Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M2 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder sb, int n);
    public delegate bool EnumProc(IntPtr h, IntPtr l);
}
"@
Add-Type -AssemblyName System.Windows.Forms

$clientPids = @(Get-Process Client -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$script:ch = [IntPtr]::Zero
$cb = [M2+EnumProc]{
    param($w, $l)
    $p = 0
    [void][M2]::GetWindowThreadProcessId($w, [ref]$p)
    if ($script:clientPids -contains [int]$p) {
        $sb = New-Object System.Text.StringBuilder 256
        [void][M2]::GetWindowTextW($w, $sb, 256)
        if ($sb.ToString().Length -gt 0 -and $sb.ToString() -notmatch 'GDI') { $script:ch = $w; return $false }
    }
    return $true
}
[void][M2]::EnumWindows($cb, [IntPtr]::Zero)
$h = $script:ch
if ($h -eq [IntPtr]::Zero) { Write-Output 'no window'; exit 1 }
Write-Output "hwnd=$h"
[void][M2]::ShowWindow($h, 9)
[void][M2]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 900

function Click($x, $y) {
    [void][M2]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 250
    [M2]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [M2]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 350
}

function TypeSlow($text) {
    foreach ($c in $text.ToCharArray()) {
        [System.Windows.Forms.SendKeys]::SendWait($c)
        Start-Sleep -Milliseconds 90
    }
}

# 账号框
Click 1399 634
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 250
[System.Windows.Forms.SendKeys]::SendWait('{END}')
Start-Sleep -Milliseconds 150
TypeSlow 'test123'
Start-Sleep -Milliseconds 400

# 密码框：直接点击而不是 TAB
Click 1399 662
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 200
TypeSlow '177587'
Start-Sleep -Milliseconds 500

# 点绿色对勾登录
Click 1523 634
Write-Output 'login submitted'
Start-Sleep -Seconds 8
