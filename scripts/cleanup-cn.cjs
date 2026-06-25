const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('safeCn')) {
    // 1. replace all `safeCn` with `cn`
    content = content.replace(/\bsafeCn\b/g, 'cn');
    
    // 2. fix the imports
    // Regex matches: import { cn, safeN } from '../utils/helpers';
    const importRegex = /import\s+\{([^}]*)\bcn\b([^}]*)\}\s+from\s+['"]([^'"]*utils\/helpers)['"]/g;
    
    content = content.replace(importRegex, (match, before, after, importPath) => {
      // Clean up the remaining imports from helpers
      const remaining = (before + after)
        .replace(/,\s*,/g, ',')
        .replace(/(^,\s*|\s*,\s*$)/g, '')
        .trim();
      
      // Calculate path to lib/utils
      const libPath = importPath.replace('utils/helpers', 'lib/utils');
      
      let res = `import { cn } from '${libPath}';`;
      if (remaining && remaining !== '') {
        res += `\nimport { ${remaining} } from '${importPath}';`;
      }
      return res;
    });
    
    // Clean up if it became `cn as cn`
    content = content.replace(/import\s+\{\s*cn\s+as\s+cn\s*\}\s+from/g, 'import { cn } from');

    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
