$token = "7P5eD8Mgmu44aWxU0I1Ib50ME9YLE/jkF0aZImG5PJA"
$repo = "neo618/WaveGeneration-EasyClaw"
$headers = @{Authorization = "token $token"; Accept = "application/vnd.github.v3+json"}
$apiBase = "https://api.github.com/repos/$repo"

# 读取所有文件的 base64 编码
$files = @()
$srcDir = "C:\Users\Administrator\wave-generator-git"
Get-ChildItem $srcDir -File | Where-Object { $_.Name -notlike "*.zip" -and $_.Name -ne ".git" } | ForEach-Object {
    $content = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.IO.File]::ReadAllText($_.FullName)))
    $files += @{path = $_.Name; content = $content}
    Write-Host "Encoded: $($_.Name)"
}

# 1. 创建 blob 并收集
$treeItems = @()
foreach ($f in $files) {
    $blobBody = @{content = $f.content; encoding = "base64"} | ConvertTo-Json
    $blob = Invoke-RestMethod -Uri "$apiBase/git/blobs" -Headers $headers -Method Post -Body $blobBody -ContentType "application/json"
    $treeItems += @{path = $f.path; mode = "100644"; type = "blob"; sha = $blob.sha}
    Write-Host "Blob: $($f.path) -> $($blob.sha)"
}

# 2. 创建 tree
$treeBody = @{base_tree = $null; tree = $treeItems} | ConvertTo-Json -Depth 10
$tree = Invoke-RestMethod -Uri "$apiBase/git/trees" -Headers $headers -Method Post -Body $treeBody -ContentType "application/json"
Write-Host "Tree: $($tree.sha)"

# 3. 创建 commit
$commitBody = @{
    message = "feat: 多通道波形CSV生成工具 v1.0`n`n- Electron 桌面应用，军工风格 UI`n- 正弦波/方波/三角波/均匀随机数`n- 1~10 通道独立配置`n- Canvas 实时预览，滚轮缩放/框选放大/拖拽平移`n- 通道显隐切换`n- CSV 导出 + 预设管理"
    tree = $tree.sha
    parents = @()
} | ConvertTo-Json -Depth 5
$commit = Invoke-RestMethod -Uri "$apiBase/git/commits" -Headers $headers -Method Post -Body $commitBody -ContentType "application/json"
Write-Host "Commit: $($commit.sha)"

# 4. 创建/更新 ref
$refBody = @{ref = "refs/heads/master"; sha = $commit.sha} | ConvertTo-Json
$ref = Invoke-RestMethod -Uri "$apiBase/git/refs" -Headers $headers -Method Post -Body $refBody -ContentType "application/json"
Write-Host "✅ Pushed to master! Ref: $($ref.ref)"
