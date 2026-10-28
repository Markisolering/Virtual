// Listar svenska texter som saknar engelsk översättning i src/i18n-en.js.
// Användning: node tools/check-i18n.mjs  (skriver ut saknade nycklar, en per rad)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { EN } = await import(join(root, 'src', 'i18n-en.js'));

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') && !p.endsWith('i18n-en.js')) files.push(p);
  }
};
walk(join(root, 'src'));

const keys = new Set();
const re = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gs;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) keys.add(m[2].replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n'));
}
// Statiska texter i index.html
const html = readFileSync(join(root, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->|<head>[\s\S]*?<\/head>/g, '');
for (const m of html.matchAll(/>([^<>]+)</g)) {
  const k = m[1].trim();
  if (/[a-zåäöA-ZÅÄÖ]{2,}/.test(k) && !/^(sk-ant-…|Claude \w+ [\d.]+|GLB|Svenska|English)$/.test(k)) keys.add(k);
}
for (const m of html.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/g)) if (m[1] !== 'sk-ant-…') keys.add(m[1]);

const missing = [...keys].filter((k) => !(k in EN));
for (const k of missing) console.log(JSON.stringify(k));
console.error(`${keys.size} texter, ${missing.length} saknar översättning`);
process.exitCode = missing.length ? 1 : 0;
