import fs from 'fs';
import path from 'path';

function cleanDir(dirPattern) {
    const files = fs.readdirSync(dirPattern, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dirPattern, file.name);
        if (file.isDirectory()) {
            cleanDir(fullPath);
        } else if (file.name.endsWith('.js') || file.name.endsWith('.js.map') || file.name.endsWith('.jsx')) {
            // Check if there is a corresponding .ts or .tsx file
            const nameWithoutExt = file.name.replace(/\.js(x)?$/, '');
            const hasTs = fs.existsSync(path.join(dirPattern, nameWithoutExt + '.ts'));
            const hasTsx = fs.existsSync(path.join(dirPattern, nameWithoutExt + '.tsx'));
            if (hasTs || hasTsx) {
                console.log('Deleting', fullPath);
                fs.unlinkSync(fullPath);
            }
        }
    }
}

cleanDir('./src');
console.log('Done cleaning JS files.');
