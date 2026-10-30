Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string c, string t);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    public delegate bool EnumProc(IntPtr h, IntPtr l);
}
"@
Add-Type -AssemblyName System.Windows.Forms

$clientPids = @(Get-Process Client -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$script:ch = [IntPtr]::Zero
$cb = [M+EnumProc]{
    param($w, $l)
    $p = 0
    [void][M]::GetWindowThreadProcessId($w, [ref]$p)
    if ($script:clientPids -contains [int]$p) {
        $sb = New-Object System.Text.StringBuilder 256
        [void][M]::GetWindowTextW($w, $sb, 256)
        if ($sb.ToString().Length -gt 0) { $script:ch = $w; return $false }
    }
    return $true
}
[void][M]::EnumWindows($cb, [IntPtr]::Zero)
$h = $script:ch
if ($h -eq [IntPtr]::Zero) { Write-Output 'no window'; exit 1 }
Write-Output "hwnd=$h"
[void][M]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 600

# click account box
[void][M]::SetCursorPos(1399, 634)
Start-Sleep -Milliseconds 200
[M]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
[M]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 500

[System.Windows.Forms.SendKeys]::SendWait('test123')
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait('{TAB}')
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('177587')
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Write-Output 'login typed'
Start-Sleep -Seconds 6
