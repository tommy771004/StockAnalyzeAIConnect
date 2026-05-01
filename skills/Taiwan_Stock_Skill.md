---
name: Taiwan_Stock_Skill
version: 1.0
updated_at: 2026-05-01
source:
  - https://www.twse.com.tw/en/page/products/trading/introduce.html
  - https://www.twse.com.tw/en/clearing/clearing/features.html
  - https://www.twse.com.tw/en/page/about/company/guide.html
---

# Taiwan Stock Skill

This file is consumed by `server/services/autonomousAgent.ts` before order execution.
Only simple `key: value` fields are parsed automatically.

## Executable Rules

settlement_cycle: T+2
price_limit_pct: 0.10
regular_lot_size: 1000
intraday_odd_lot_start: 09:00
intraday_odd_lot_end: 13:30
intraday_odd_lot_min_qty: 1
intraday_odd_lot_max_qty: 999

## Notes

- T+2 settlement means buying power checks should stay conservative.
- TW stocks generally use a daily ±10% fluctuation band (with regulatory exceptions such as IPO initial days).
- Orders below 1,000 shares are odd-lot and should follow odd-lot session constraints.
