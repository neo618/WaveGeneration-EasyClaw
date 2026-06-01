$token = "7P5eD8Mgmu44aWxU0I1Ib50ME9YLE/jkF0aZImG5PJA"
$repo = "neo618/WaveGeneration-EasyClaw"
$headers = @{Authorization = "token $token"; Accept = "application/vnd.github.v3+json"}
$apiBase = "https://api.github.com/repos/$repo"

$srcDir = "C:\Users\Administrator\wave-generator-git"
$fileNames = @(".gitignore", ".npmrc", "README.md", "index.html", "main.js", "package.json", "preload.js", "renderer.js", "style.css")

# 逐个上传 blob
$treeItems = @()
foreach ($name in $fileNames) {
    $path = Join-Path $srcDir $name
    if (-not (Test-Path $path)) { continue }
    $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($raw))
    $blobBody = @{content = $b64; encoding = "base64"} | ConvertTo-Json
    $blob = Invoke-RestMethod -Uri "$apiBase/git/blobs" -Headers $headers -Method Post -Body $blobBody -ContentType "application/json"
    $treeItems += @{path = $name; mode = "100644"; type = "blob"; sha = $blob.sha}
    Write-Host "OK: $name"
}

$treeBody = @{base_tree = $null; tree = $treeItems} | ConvertTo-Json -Depth 10
$tree = Invoke-RestMethod -Uri "$apiBase/git/trees" -Headers $headers -Method Post -Body $treeBody -ContentType "application/json"
Write-Host "Tree: $($tree.sha)"

$commitBody = @{message = "feat: 多通道波形CSV生成工具 v1.0"; tree = $tree.sha; parents = @()} | ConvertTo-Json
$commit = Invoke-RestMethod -Uri "$apiBase/git/commits" -Headers $headers -Method Post -Body $commitBody -ContentType "application/json"
Write-Host "Commit: $($commit.sha)"

$refBody = @{ref = "refs/heads/master"; sha = $commit.sha} | ConvertTo-Json
Invoke-RestMethod -Uri "$apiBase/git/refs" -Headers $headers -Method Post -Body $refBody -ContentType "application/json"
Write-Host "✅ DONE!"