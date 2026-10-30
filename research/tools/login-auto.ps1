param(
    [string]$Account = 'test123',
    [string]$Password = '177587',
    [string]$ClientDir = 'C:\Users\sjy\mir2-test\Crystal\Build\Client\Release'
)

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class W32 {
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumChildProc cb, IntPtr p);
    public delegate bool EnumChildProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int n);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wp, IntPtr lp);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wp, string lp);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumChildProc cb, IntPtr p);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
"@

$WM_SETTEXT = 0x000C
$WM_CHAR = 0x0102
$WM_KEYDOWN = 0x0100
$WM_KEYUP = 0x0101

# find client window by title
function Find-Client {
    $found = [IntPtr]::Zero
    $cb = [W32+EnumChildProc]{
        param($h, $l)
        $sb = New-Object System.Text.StringBuilder 256
        [void][W32]::GetWindowText($h, $sb, 256)
        $t = $sb.ToString()
        if ($t -like '*传奇*' -or $t -like '*Legend of Mir*') {
            $script:found = $h
            return $false
        }
        $sb2 = New-Object System.Text.StringBuilder 256
        [void][W32]::GetClassName($h, $sb2, 256)
        return $true
    }
    [void][W32]::EnumWindows($cb, [IntPtr]::Zero)
    return $script:found
}

# launch
Get-Process Client -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
Start-Process -FilePath (Join-Path $ClientDir 'Client.exe') -WorkingDirectory $ClientDir
Start-Sleep -Seconds 12

$hwnd = Find-Client
if ($hwnd -eq [IntPtr]::Zero) { Write-Output 'NO CLIENT WINDOW'; exit 1 }
Write-Output ("client hwnd: " + $hwnd)

# enumerate edit children
$edits = New-Object System.Collections.ArrayList
$cb = [W32+EnumChildProc]{
    param($h, $l)
    $sb = New-Object System.Text.StringBuilder 128
    [void][W32]::GetClassName($h, $sb, 128)
    if ($sb.ToString() -eq 'Edit') { [void]$script:edits.Add($h) }
    return $true
}
[void][W32]::EnumChildWindows($hwnd, $cb, [IntPtr]::Zero)
Write-Output ("edit controls: " + $edits.Count)

if ($edits.Count -lt 2) { Write-Output 'TOO FEW EDITS'; exit 2 }

# account first, then password (OK button depends on password TextChanged)
[void][W32]::SendMessage($edits[0], $WM_SETTEXT, [IntPtr]::Zero, $Account)
Start-Sleep -Milliseconds 300
[void][W32]::SendMessage($edits[1], $WM_SETTEXT, [IntPtr]::Zero, $Password)
Start-Sleep -Milliseconds 500

# enter key on password box
[void][W32]::SendMessage($edits[1], $WM_CHAR, [IntPtr]0x0D, [IntPtr]1)
[void][W32]::SendMessage($edits[1], $WM_KEYDOWN, [IntPtr]0x0D, [IntPtr]1)
[void][W32]::SendMessage($edits[1], $WM_KEYUP, [IntPtr]0x0D, [IntPtr]1)
Write-Output 'login sent'
Start-Sleep -Seconds 8
Get-Process Client -ErrorAction SilentlyContinue | Select-Object Id, MainWindowTitle
