const fs = require('fs');

function replaceFile(path, regex, replacement) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(regex, replacement);
  fs.writeFileSync(path, content);
}

// 1. Fix MarketOverview duplicate block caused by bad multi_replace
let mo = fs.readFileSync('src/components/MarketOverview.tsx', 'utf8');
// remove the extra duplicated block from the start down to `import { cn } from '../lib/utils';`
const fixedMo = mo.replace(/(\/\*\*[\s\S]*?MarketOverview\.tsx[\s\S]*?import \{ cn \} from '\.\.\/lib\/utils';)/g, (match, p1, offset) => {
  if (offset > 0) return '';
  return match;
});
fs.writeFileSync('src/components/MarketOverview.tsx', fixedMo);

// And remove any remaining duplicate `import { cn } from '../lib/utils';`
mo = fs.readFileSync('src/components/MarketOverview.tsx', 'utf8');
mo = mo.replace(/(import \{ cn \} from '\.\.\/lib\/utils';\s*){2,}/g, "import { cn } from '../lib/utils';\n");
fs.writeFileSync('src/components/MarketOverview.tsx', mo);


// 2. Fix BacktestPanel.tsx
replaceFile('src/components/BacktestPanel.tsx', 
  /import \{ STORAGE_KEYS \} from '\.\.\/utils\/storage';\n?/, 
  ''
);
replaceFile('src/components/BacktestPanel.tsx', 
  /STORAGE_KEYS\.TOKEN/g, 
  "'auth_token'"
);

// 3. Fix useQueryHooks.ts
replaceFile('src/hooks/useQueryHooks.ts', 
  /import \{ STORAGE_KEYS \} from '\.\.\/utils\/storage';\n?/, 
  ''
);
replaceFile('src/hooks/useQueryHooks.ts', 
  /STORAGE_KEYS\.WATCHLIST/g, 
  "'liquid_intel_watchlist'"
);

// 4. Fix useTradingCore.ts
replaceFile('src/hooks/useTradingCore.ts', 
  /import \{ STORAGE_KEYS \} from '\.\.\/utils\/storage';\n?/, 
  ''
);
replaceFile('src/hooks/useTradingCore.ts', 
  /STORAGE_KEYS\.WATCHLIST/g, 
  "'liquid_intel_watchlist'"
);
