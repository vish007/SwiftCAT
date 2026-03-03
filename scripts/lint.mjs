import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const file of readdirSync(dir)) {
    const p = join(dir, file);
    if (['.git', 'node_modules'].includes(file)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.mjs') || p.endsWith('.md') || p.endsWith('.yaml') || p.endsWith('.yml') || p.endsWith('.json')) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walk('.')) {
  const txt = readFileSync(file, 'utf8');
  if (txt.includes('\t')) {
    console.error(`Tab character found in ${file}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('lint ok');
