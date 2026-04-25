/**
 * server/services/commanderService.ts
 * AI 指揮官服務：將自然語言轉換為交易參數指令
 */
import { callLLM } from '../utils/llmPipeline.js';
import { updateAgentConfig, getAgentConfig } from './autonomousAgent.js';

const COMMANDER_SYSTEM_PROMPT = `你是一位資深的自動交易系統管理員。
你的任務是解析用戶的自然語言指令，並將其轉換為系統配置修改。

[目前的配置]: \${currentConfig}

[支援的操作]:
1. 修改止損/止盈: "把止損改為 3%" -> { "params": { "stopLossPct": 3 } }
2. 修改特定標的參數: "2330 的 AI 權重加倍" -> { "symbolConfigs": { "2330.TW": { "AI_LLM": { "weight": 0.8 } } } }
3. 增加/刪除標的: "幫我監控 NVDA" -> { "symbols": ["...", "NVDA"] }
4. 啟動影子策略: "開啟一個激進模式的影子帳戶" -> { "shadowConfigs": { "Aggressive": { "params": { "stopLossPct": 10 } } } }

請只回傳 JSON 格式的修改內容。`;

export async function processCommanderCommand(userId: string, command: string) {
  const currentConfig = getAgentConfig();
  
  try {
    const { text } = await callLLM({
      systemPrompt: COMMANDER_SYSTEM_PROMPT.replace('\${currentConfig}', JSON.stringify(currentConfig)),
      prompt: command,
      jsonMode: true,
      userId
    });

    const patch = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    
    // 執行修改 (內部會進行 zod 驗證)
    const result = updateAgentConfig(patch);
    
    if (!result.ok) {
      return { ok: false, error: `指令解析成功，但配置內容不合法：${result.error}` };
    }
    
    return {
      ok: true,
      actionTaken: `已根據戰術指令安全更新配置：${Object.keys(patch).join(', ')}`,
      patch
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
