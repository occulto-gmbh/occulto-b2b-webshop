#!/usr/bin/env node
/*
 * Prüft Theme-Änderungen mechanisch – ohne Modell, ohne Tokens.
 *
 *   node werkzeuge/pruefen.mjs              geänderte Dateien (git), mit Theme Check
 *   node werkzeuge/pruefen.mjs --schnell    ohne Theme Check (der braucht 1–3 Minuten)
 *   node werkzeuge/pruefen.mjs datei …      nur diese Dateien (Pfade relativ zu theme/)
 *
 * Warum ein Skript statt eines Subagenten: ein Probelauf mit Haiku am 30.09.2026 fand einen von vier
 * Befunden, widersprach sich selbst und brach den Theme Check ab. Mechanisches gehört in Code;
 * Urteil (Texte, Gegenlesen) in die Agenten unter .claude/agents/.
 *
 * Ausgabe: "OK" oder eine Zeile je Befund. Rückgabewert 1, wenn es Befunde gibt.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME = path.join(REPO, 'theme');

const argumente = process.argv.slice(2);
const schnell = argumente.includes('--schnell');
const genannt = argumente.filter((a) => !a.startsWith('--'));

const befunde = [];
const hinweise = [];
const melde = (datei, zeile, text) => befunde.push(`${datei}${zeile ? ':' + zeile : ''} – ${text}`);

/* ------------------------------------------------------------ Dateien */

function git(befehl) {
  return execSync(befehl, { cwd: REPO, encoding: 'utf8' }).split('\n').map((z) => z.trim()).filter(Boolean);
}

const geaendert = genannt.length
  ? genannt.map((d) => d.replace(/^theme[\\/]/, '').replace(/\\/g, '/'))
  : [
      ...git('git diff --name-only HEAD -- theme'),
      ...git('git ls-files --others --exclude-standard -- theme'),
    ].map((d) => d.replace(/^theme\//, ''));

const vorhanden = [...new Set(geaendert)].filter((d) => fs.existsSync(path.join(THEME, d)));
const lies = (d) => fs.readFileSync(path.join(THEME, d), 'utf8');
const zeileVon = (text, index) => text.slice(0, index).split('\n').length;

function alleDateien(ordner) {
  return fs.readdirSync(path.join(THEME, ordner)).map((n) => `${ordner}/${n}`);
}
const theme = ['layout', 'sections', 'snippets', 'blocks', 'templates', 'assets']
  .filter((o) => fs.existsSync(path.join(THEME, o)))
  .flatMap(alleDateien)
  .filter((d) => /\.(liquid|json|js|css)$/.test(d));

/* ------------------------------------------------------- 1. JS-Syntax */

function pruefeJs(datei, code, versatz = 0) {
  try {
    new vm.Script(code, { filename: datei });
  } catch (fehler) {
    const zeile = fehler.stack && (fehler.stack.match(/:(\d+)\n/) || [])[1];
    melde(datei, zeile ? versatz + Number(zeile) - 1 : versatz, `JS-Syntax: ${fehler.message}`);
  }
}

/* Liquid in <script> so ersetzen, dass gültiges JS übrig bleibt, wenn es vorher gültig gedacht war. */
function ohneLiquid(code) {
  return code
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '0')
    .replace(/\{%[\s\S]*?%\}/g, '');
}

for (const datei of vorhanden) {
  const text = lies(datei);
  if (datei.endsWith('.js')) pruefeJs(datei, text);
  if (datei.endsWith('.liquid')) {
    for (const m of text.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      const attr = m[1] || '';
      if (/\bsrc=|type="(application\/(ld\+)?json|module)"/.test(attr)) continue;
      pruefeJs(datei, ohneLiquid(m[2]), zeileVon(text, m.index));
    }
  }
}

// ----------------------------------------------- 2. Kaputte Regex-Muster
// Entstehen, wenn Backslashes beim Einfügen verloren gehen: aus \d[\d.\s] wird d[d.s].

const kaputt = [/\/d\[d/, /\[sS\]/, /replace\(\/D\//, /match\(\/d[\[\/]/, /\/s\+\//];
for (const datei of vorhanden.filter((d) => /\.(js|liquid)$/.test(d))) {
  const text = lies(datei);
  for (const muster of kaputt) {
    const m = text.match(muster);
    if (m) melde(datei, zeileVon(text, m.index), `Regex ohne Backslash? „${m[0]}"`);
  }
}

/* -------------------------------------------- 3. Geschäftszahlen gleich?
   Die Zahlen dürfen an mehreren Stellen stehen, müssen aber überall gleich sein. */

const regeln = {
  'Rabatt Nachbestellung (%)': [
    /\b(?:b2b_)?satz_nachbestellung\s*=\s*(\d+)/,
    /\bSATZ\s*=\s*(\d+)\s*;/,
    /\bassign satz\s*=\s*(\d+)/, // b2b-korb-art kennt nur die Nachbestellung
  ],
  'Schwelle Nachbestellung (Packs)': [/\b(?:b2b_)?ab_packs\s*=\s*(\d+)/, /\bAB_PACKS\s*=\s*(\d+)/, /\bdiscount_min_packs\s*=\s*(\d+)/],
};
const funktionen = path.join(REPO, 'b2b-webshop', 'extensions', 'order-value-discount', 'src', 'run.ts');
const quellen = theme.map((d) => [d, lies(d)]);
if (fs.existsSync(funktionen)) quellen.push(['../b2b-webshop/…/order-value-discount/src/run.ts', fs.readFileSync(funktionen, 'utf8')]);

for (const [name, muster] of Object.entries(regeln)) {
  const werte = new Map();
  for (const [datei, text] of quellen) {
    for (const m of muster) {
      const t = text.match(m);
      if (t) (werte.get(t[1]) || werte.set(t[1], []).get(t[1])).push(datei);
    }
  }
  if (werte.size > 1) {
    melde('', 0, `${name} uneinheitlich: ` + [...werte].map(([w, d]) => `${w} in ${d.join(', ')}`).join(' | '));
  }
}

/* ------------------------------------------------- 4. Verwaiste Snippets */

// Ohne Kommentare und ohne die eigene Datei: sonst zählt das "@example {% render 'x' %}" im
// Kopfkommentar eines Snippets als Aufruf, und ein totes Snippet findet sich selbst.
const ohneKommentare = (t) =>
  t.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '').replace(/\{%-?\s*#[^%]*%\}/g, '');
const bereinigt = quellen.map(([d, t]) => [d, ohneKommentare(t)]);

for (const datei of theme.filter((d) => d.startsWith('snippets/'))) {
  const name = path.basename(datei, '.liquid');
  const wichtig = name.startsWith('b2b-') || vorhanden.includes(datei);
  if (!wichtig) continue;
  const aufruf = new RegExp(`(render|include)\\s+['"]${name}['"]`);
  const genutzt = bereinigt.some(([d, t]) => d !== datei && aufruf.test(t));
  if (!genutzt) melde(datei, 0, 'Snippet wird nirgends gerendert');
}

// Verwaiste b2b-Assets: eine eigene CSS- oder JS-Datei, deren Name nirgends sonst im Theme steht,
// wird nie geladen. So blieb b2b-reiter.js liegen, nachdem die Reiter aus dem Theme verschwunden waren.
for (const datei of theme.filter((d) => /^assets\/b2b-.*\.(css|js)$/.test(d))) {
  const name = path.basename(datei);
  const geladen = bereinigt.some(([d, t]) => d !== datei && t.includes(name));
  if (!geladen) melde(datei, 0, 'Asset wird nirgends eingebunden');
}

/* ------------------------------------------ 5. Ungenutzte b2b-Klassen
   Nur Klassen mit Präfix b2b-, die in eigenem CSS definiert sind (assets/b2b-*.css und <style> in
   b2b-Dateien). Gilt als benutzt, wenn der Name irgendwo sonst im Theme vorkommt – in Markup, JS oder
   JSON-Templates. Aus Präfix plus Variable zusammengesetzte Namen erkennt das nicht; die gibt es hier nicht. */

const eigenesCss = theme.filter((d) => /^assets\/b2b-.*\.css$/.test(d) || /\/b2b-[^/]*\.liquid$/.test(d));
const definiert = new Map();
for (const datei of eigenesCss) {
  let css = lies(datei);
  if (datei.endsWith('.liquid')) css = [...css.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|\{%-?\s*style\s*-?%\}([\s\S]*?)\{%-?\s*endstyle/g)].map((m) => m[1] || m[2]).join('\n');
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/\.(b2b-[a-z0-9_-]+)/g)) if (!definiert.has(m[1])) definiert.set(m[1], datei);
}
const ohneDefinitionen = bereinigt
  .map(([d, t]) => (d.endsWith('.css') ? '' : t.replace(/<style[^>]*>[\s\S]*?<\/style>|\{%-?\s*style\s*-?%\}[\s\S]*?\{%-?\s*endstyle\s*-?%\}/g, '')))
  .join('\n');
for (const [klasse, datei] of definiert) {
  if (!new RegExp(`(^|[^a-z0-9_-])${klasse}($|[^a-z0-9_-])`).test(ohneDefinitionen)) {
    melde(datei, 0, `CSS-Klasse .${klasse} wird nirgends verwendet`);
  }
}

/* ---------------------------------------------------- 6. Theme Check */

if (schnell) {
  hinweise.push('Theme Check übersprungen (--schnell).');
} else if (vorhanden.length) {
  const lauf = spawnSync('shopify theme check --output json', {
    cwd: THEME,
    shell: true,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const start = (lauf.stdout || '').indexOf('[');
  if (start < 0) {
    hinweise.push(`Theme Check lief nicht (${lauf.error ? lauf.error.message : 'keine JSON-Ausgabe'}).`);
  } else {
    const ziel = new Set(vorhanden.map((d) => path.join(THEME, d).toLowerCase()));
    for (const eintrag of JSON.parse(lauf.stdout.slice(start))) {
      if (!ziel.has(path.resolve(eintrag.path).toLowerCase())) continue;
      const rel = path.relative(THEME, eintrag.path).replace(/\\/g, '/');
      for (const o of eintrag.offenses) {
        // Der Theme Check sieht kein Liquid in JSON-Templates und meldet deshalb Snippets als
        // verwaist, die die Landingpage rendert. Punkt 4 oben prüft das richtig.
        if (o.check === 'OrphanedSnippet') continue;
        melde(rel, o.start_row + 1, `${o.check}: ${o.message}`);
      }
    }
  }
}

/* -------------------------------------------------------------- Ausgabe */

console.log(`${vorhanden.length} Datei(en) geprüft.`);
for (const h of hinweise) console.log(h);
if (!befunde.length) {
  console.log('OK');
} else {
  for (const b of befunde) console.log('- ' + b);
  process.exitCode = 1;
}
