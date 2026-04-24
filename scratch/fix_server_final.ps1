$path = "d:\Project\github\StockAnalyzeAIConnect\server.ts"
$lines = Get-Content $path
$newLines = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    
    # Fix Register route if missing
    if ($line -match "const { email, password, name } = req.body \?\? {};") {
        if ($i -gt 0 -and $lines[$i-1] -notmatch "app.post\('/api/auth/register'") {
            $newLines.Add("  app.post('/api/auth/register', async (req, res) => {")
        }
    }
    
    # Fix Snapshot log line
    if ($line -match 'console.log\(`\[Snapshot\]') {
        $newLines.Add('             console.log("[Snapshot] " + date + " " + user.email + " -> " + equity);')
    } else {
        $newLines.Add($line)
    }
}

$newLines | Set-Content $path -Encoding UTF8
Write-Host "File fixed successfully."
