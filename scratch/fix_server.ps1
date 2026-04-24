$path = "d:\Project\github\StockAnalyzeAIConnect\server.ts"
$lines = Get-Content $path

# Fix AI route: lines 561 to 623
$beforeAI = $lines[0..559]
$afterAI = $lines[623..($lines.Count - 1)]

$newAIBlock = @'
  app.get('/api/ai/summarize/:symbol', authMiddleware, async (req: AuthRequest, res) => {
    const sym = req.params.symbol;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI key missing' });

    try {
      const [quoteRes, newsRes] = await Promise.allSettled([
        NativeYahooApi.quote(sym),
        NativeYahooApi.search(sym)
      ]);
      const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
      const news  = newsRes.status === 'fulfilled' ? (newsRes.value as any).news : [];
      const newsText = news.slice(0,3).map((n:any) => `- ${n.title}`).join('\n');

      const prompt = `你是一位專業的金融分析師。請針對 ${sym} 提供 AI 摘要分析。現價 ${quote?.regularMarketPrice || 'N/A'}。最近新聞：\n${newsText}`;

      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const json = await orRes.json() as any;
      res.json({ text: json?.choices?.[0]?.message?.content || '無法生成摘要' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
'@

# Assemble temporary middle part
$tempContent = $beforeAI + $newAIBlock + $afterAI

# Fix Snapshot log: find the line containing "[Snapshot]" and replace it
# It was shifted by 33 lines, so it's around 1303 - 33 = 1270?
# No, let's just find the line content.
for ($i = 0; $i -lt $tempContent.Count; $i++) {
    if ($tempContent[$i] -like '*console.log(`[Snapshot]*') {
        $tempContent[$i] = '             console.log("[Snapshot] " + date + " " + user.email + " -> " + equity);'
        Write-Host "Fixed snapshot log at line $($i + 1)"
    }
}

$tempContent | Set-Content $path -Encoding UTF8
Write-Host "File updated successfully."
