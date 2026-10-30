Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M6 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    public struct RECT { public int L, T, R, B; }
}
"@
Add-Type -AssemblyName System.Windows.Forms

$proc = Get-Process Client -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output 'no client window'; exit 1 }
$hw = $proc.MainWindowHandle
Write-Output "hwnd=$hw"

[void][M6]::SwitchToThisWindow($hw, $true)
Start-Sleep -Milliseconds 1200
if ([M6]::GetForegroundWindow() -ne $hw) { Write-Output 'WARN: not foreground' } else { Write-Output 'foreground OK' }

$rect = New-Object M6+RECT
[void][M6]::GetWindowRect($hw, [ref]$rect)
$fw = [double]($rect.R - $rect.L)
$fh = [double]($rect.B - $rect.T)
[int]$accX = [double]$rect.L + ($fw * 0.500)
[int]$accY = [double]$rect.T + ($fh * 0.485)
[int]$pwdY = [double]$rect.T + ($fh * 0.524)
Write-Output "win=$($rect.L),$($rect.T) ${fw}x${fh} acc=($accX,$accY) pwd=($accX,$pwdY)"

function ClickAt([int]$px, [int]$py) {
    [void][M6]::SetCursorPos($px, $py)
    Start-Sleep -Milliseconds 400
    [M6]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 120
    [M6]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 700
}
function TypeOne([string]$text) {
    foreach ($c in $text.ToCharArray()) {
        [System.Windows.Forms.SendKeys]::SendWait($c)
        Start-Sleep -Milliseconds 200
    }
}

ClickAt $accX $accY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{DEL}')
Start-Sleep -Milliseconds 400
TypeOne 'test123'
Start-Sleep -Milliseconds 800
Write-Output 'account typed'

ClickAt $accX $pwdY
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{DEL}')
Start-Sleep -Milliseconds 400
TypeOne '177587'
Start-Sleep -Milliseconds 800
Write-Output 'password typed'

# 点击绿色对勾提交登录
ClickAt $okX $okY
Write-Output 'login submitted'
Start-Sleep -Seconds 8
