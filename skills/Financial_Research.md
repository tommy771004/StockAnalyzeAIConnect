---
name: financial-research
description: "Guidelines and tools for performing deep financial research and quantitative strategy testing using scientific methods (Polars, Arxiv, TimesFM)."
---

# Financial Research Agent Skill

This skill provides instructions for the agent on how to approach deep financial research, especially when confidence in a standard technical indicator is low.

## 核心原則 (Core Principles)

1. **反向驗證 (Contrarian Verification)**: When generating a trading signal (e.g., BUY), always search for the opposite bearish sentiment in current news or research papers.
2. **數據驅動回測 (Data-Driven Backtesting)**: Never deploy a new strategy without backtesting. Use high-performance frameworks like Polars for evaluating tick-level or large timeframe data.
3. **學術佐證 (Academic Grounding)**: Turn to scholarly articles (arXiv) to validate the mathematical foundation of quantitative strategies (e.g., mean reversion parameters, momentum decay rates).

## 深層研究工作流 (Deep Research Workflow)

- **Trigger**: When `confidence < 65%` and action `!== HOLD`.
- **Action**:
  1. Use `Parallel-Web` to scrape recent news for the target symbol.
  2. Synthesize arguments that *oppose* the initial signal.
  3. Re-evaluate the signal based on the new deep context.
  
## Strategy Sandbox 擴充

When a user interacts with the **Strategy Sandbox** and asks for academic strategies:
- Use the `searchArxiv(query)` utility to fetch the latest quantitative finance papers.
- Summarize the paper's mathematical formula.
- Translate the formula into actionable TypeScript strategy parameters.
- Provide clear performance expectations (Sharpe ratio, max drawdown) based on paper claims.

## 台灣股市特殊性 (Taiwan Market Specifics integration)
Always cross-reference your findings with the `Taiwan_Stock_Market.md` skill to ensure the researched strategies comply with local limitations (10% circuit breakers, T+2 settlement, specific trading hours).
