// Språk: svenska (grund) eller engelska. Texterna i koden skrivs på svenska och slås upp i EN
// (src/i18n-en.js) när appen körs på engelska. Byte av språk laddar om appen.
//
//   t('Gå närmare för att prata med {name}.', { name })
//
// Statiska texter i index.html översätts med translateDom(). Kör `node tools/check-i18n.mjs` för att
// hitta texter som saknar engelsk översättning.

import { EN } from './i18n-en.js';

function readLang() {
  try {
    const raw = localStorage.getItem('virtual-room-settings');
    const s = JSON.parse(raw || '{}');
    if (s.lang === 'sv' || s.lang === 'en') return s.lang;
    // Den som redan har använt appen (före språkvalet) fortsätter på svenska
    if (raw) return 'sv';
  } catch {
    // Ingen lagring: gissa utifrån telefonens språk
  }
  return /^(sv|nb|nn|no|da)\b/i.test(navigator.language || 'sv') ? 'sv' : 'en';
}

export const lang = readLang();
export const en = lang === 'en';
// Språkkod för tal och taligenkänning
export const speechLang = en ? 'en-US' : 'sv-SE';
export const locale = en ? 'en-US' : 'sv-SE';

export function t(sv, vars) {
  let s = en ? (EN[sv] ?? sv) : sv;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// Välj mellan en svensk och en engelsk variant (för listor och längre texter)
export const L = (sv, enText) => (en ? enText : sv);

// Översätt texter och attribut i ett DOM-träd (exakta träffar, blanksteg runt texten behålls)
export function translateDom(root = document.body) {
  if (!en) return;
  document.documentElement.lang = 'en';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue;
    const key = raw.trim();
    if (!key || !(key in EN)) continue;
    n.nodeValue = raw.replace(key, EN[key]);
  }
  for (const el of root.querySelectorAll('[placeholder],[aria-label],[title]')) {
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = el.getAttribute(a);
      if (v && v in EN) el.setAttribute(a, EN[v]);
    }
  }
  if (document.title in EN) document.title = EN[document.title];
}
