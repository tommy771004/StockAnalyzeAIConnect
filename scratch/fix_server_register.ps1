$path = "d:\Project\github\StockAnalyzeAIConnect\server.ts"
$lines = Get-Content $path

# Find the line "    const { email, password, name } = req.body ?? {};"
# And insert "  app.post('/api/auth/register', async (req, res) => {" before it if it's missing.
$newLines = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "const { email, password, name } = req.body \?\? {};") {
        # Check if previous line is already the app.post
        if ($i -gt 0 -and $lines[$i-1] -notmatch "app.post\('/api/auth/register'") {
            $newLines.Add("  app.post('/api/auth/register', async (req, res) => {")
        }
    }
    $newLines.Add($lines[$i])
}

$newLines | Set-Content $path -Encoding UTF8
Write-Host "File fixed successfully."
