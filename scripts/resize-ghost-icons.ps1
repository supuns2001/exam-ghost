Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\user\.gemini\antigravity-ide\brain\3c7a0158-433d-453c-a74b-74a38d2fbfe7\study_ghost_logo_1792637234093.jpg"
$destDir = "f:\Learning\extensions\test01\public\icons"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$img = [System.Drawing.Image]::FromFile($srcPath)
$sizes = @(16, 32, 48, 128, 256)

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($img, 0, 0, $s, $s)
    $g.Dispose()
    
    $outPath = Join-Path $destDir "icon$s.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated icon: $outPath"
}

# Also save high-res logo.png (512x512)
$bmp512 = New-Object System.Drawing.Bitmap 512, 512
$g512 = [System.Drawing.Graphics]::FromImage($bmp512)
$g512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g512.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g512.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g512.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g512.DrawImage($img, 0, 0, 512, 512)
$g512.Dispose()
$logoPath = Join-Path $destDir "logo.png"
$bmp512.Save($logoPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Dispose()
Write-Host "Generated high-res logo: $logoPath"

$img.Dispose()
Write-Host "Icon generation completed successfully!"
