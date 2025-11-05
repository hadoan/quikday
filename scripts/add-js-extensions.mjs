import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dirsToProcess = [
  path.join(__dirname, '../apps/api/src'),
  path.join(__dirname, '../packages/libs'),
  path.join(__dirname, '../packages/types'),
  path.join(__dirname, '../packages/agent'),
];

function addJsExtensions(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Match relative imports without extensions
  // Matches: from './something' or from '../something' or from '../folder/something'
  const importRegex = /(from\s+['"])(\.\.[\/\\][^'"]+|\.\/[^'"]+)(['"])/g;
  
  content = content.replace(importRegex, (match, prefix, importPath, suffix) => {
    // Skip if already has an extension
    if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
      return match;
    }
    
    modified = true;
    return `${prefix}${importPath}.js${suffix}`;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated: ${filePath}`);
  }
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      addJsExtensions(fullPath);
    }
  }
}

console.log('Adding .js extensions to relative imports...');
for (const dir of dirsToProcess) {
  if (fs.existsSync(dir)) {
    console.log(`Processing: ${dir}`);
    processDirectory(dir);
  }
}
console.log('Done!');
