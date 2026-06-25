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
  let original = content;

  // Fix duplicate cn imports: "import { cn } from '../lib/utils';\nimport { cn } from '../lib/utils';"
  content = content.replace(/(import\s+\{\s*cn\s*\}\s+from\s+['"][^'"]+['"];\s*)\1/g, '$1');

  // Fix invalid syntax: "import { , safeN" -> "import { safeN"
  content = content.replace(/import\s+\{\s*,\s*/g, 'import { ');
  
  // Fix double semicolons: ";;"
  content = content.replace(/;;/g, ';');
  
  // Fix "import {  } from '../utils/helpers';"
  content = content.replace(/import\s+\{\s*\}\s+from\s+['"][^'"]+['"];/g, '');

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Fixed syntax in ${file}`);
  }
});
