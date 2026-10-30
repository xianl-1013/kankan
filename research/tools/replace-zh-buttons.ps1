$ErrorActionPreference = 'Continue'
$root = 'C:\Users\sjy\mir2-test'
$dataDir = "$root\Crystal\Build\Client\Release\Data"
$exe = "$root\shuangfu-extract\lib-replacer\dist\LibFrameReplace\LibFrameReplace.exe"
$bak = "$dataDir\_zhbak"

Get-Process Client -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

New-Item -ItemType Directory -Force $bak | Out-Null
foreach ($l in @('Title.Lib', 'Prguse.Lib')) {
    $src = Join-Path $dataDir $l
    $dst = Join-Path $bak $l
    if ((Test-Path $src) -and -not (Test-Path $dst)) { Copy-Item $src $dst -Force }
}

$ok = 0; $fail = @()
foreach ($lib in @('Title', 'Prguse')) {
    $pngDir = "$root\tools\zh-buttons\$lib"
    if (-not (Test-Path $pngDir)) { continue }
    $libPath = Join-Path $dataDir "$lib.Lib"
    foreach ($png in (Get-ChildItem $pngDir -Filter *.png | Sort-Object Name)) {
        $idx = [int]([IO.Path]::GetFileNameWithoutExtension($png.Name))
        $srcFrame = Get-ChildItem "$root\tools\lib-frames-used\$lib" -Filter ("{0:d5}_*.png" -f $idx) | Select-Object -First 1
        if (-not $srcFrame) { $fail += "$lib[$idx] no source frame size"; continue }
        $m = [regex]::Match($srcFrame.Name, '_(\d+)x(\d+)\.png$')
        if (-not $m.Success) { $fail += "$lib[$idx] bad name"; continue }
        $w = $m.Groups[1].Value; $h = $m.Groups[2].Value
        $out = & $exe $libPath $idx $png.FullName --scale "${w}x${h}" 2>&1
        if ($LASTEXITCODE -eq 0) { $ok++ } else { $fail += "$lib[$idx] : " + (($out | Select-Object -Last 2) -join ' ') }
    }
}
Write-Output ("REPLACED: " + $ok)
Write-Output ("FAILED: " + $fail.Count)
$fail | ForEach-Object { Write-Output ("  " + $_) }
