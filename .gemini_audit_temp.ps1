Get-ChildItem -Path src,server -Recurse -Include *.ts,*.tsx -File |
  Where-Object { $_.FullName -notmatch 'node_modules|egg-info' } |
  Sort-Object -Property Length -Descending |
  Select-Object -First 25 @{N='File';E={$_.FullName -replace [regex]::Escape('d:\Project\github\StockAnalyzeAIConnect\'), ''}}, @{N='KB';E={[math]::Round($_.Length/1KB,1)}} |
  Format-Table -AutoSize
