$path = "d:\Project\github\StockAnalyzeAIConnect\server.ts"
$encBig5 = [System.Text.Encoding]::GetEncoding(950)
$encUtf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Read file as Big5
$content = [System.IO.File]::ReadAllText($path, $encBig5)

# 1. Fix the duplicate/broken prompt block
# We'll just use simple regex to remove the garbled part if we can find it.
# Actually, since I already replaced some parts, it might be messy.

# 2. Fix known syntax errors (template literals)
# Change `[Snapshot] ...` to use concatenation
$content = $content -replace 'console\.log\(`\[Snapshot\].*?`\);', 'console.log("[Snapshot] " + date + " " + user.email + " -> " + equity);'
$content = $content -replace 'console\.error\(`\[Snapshot\] Error for user \${user\.email}:`, userErr\);', 'console.error("[Snapshot] Error for user " + user.email + ":", userErr);'

# Write back as UTF8 No BOM
[System.IO.File]::WriteAllText($path, $content, $encUtf8NoBom)
Write-Host "File encoding and syntax fixed."
