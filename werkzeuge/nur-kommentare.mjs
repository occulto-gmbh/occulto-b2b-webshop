#!/usr/bin/env node
/*
 * Stellt fest, ob sich an Dateien gegenüber HEAD nur Kommentare geändert haben.
 *
 *   node werkzeuge/nur-kommentare.mjs datei …    Pfade relativ zum Repo
 *
 * Für Aufräumarbeiten, bei denen ein Agent Kommentare umschreibt: vergleicht beide Fassungen mit
 * entfernten Kommentaren und normalisierten Leerräumen. Ist der Rest gleich, ist der Code unberührt.
 * Ausgabe je Datei "nur Kommentare" oder die erste abweichende Stelle. Rückgabewert 1 bei Abweichung.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ohneKommentare(text, datei) {
  let t = text;
  // Liquid: Blockkommentare, Kommentare im liquid-Tag, Inline-Kommentare
  t = t.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
  t = t.replace(/^\s*comment\b[\s\S]*?^\s*endcomment\b.*$/gm, '');
  t = t.replace(/\{%-?\s*#[^%]*%\}/g, '');
  // CSS und JS: Blockkommentare überall (auch in <style>/<script> von .liquid)
  t = t.replace(/\/\*[\s\S]*?\*\//g, '');
  // JS: Zeilenkommentare – nicht in URLs wie https://
  if (/\.(js|mjs|ts|liquid)$/.test(datei)) t = t.replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1');
  // Leerraum vereinheitlichen: Zeilen trimmen, leere Zeilen weg
  return t.split(/\r?\n/).map((z) => z.trim()).filter(Boolean).join('\n');
}

let abweichung = false;
for (const datei of process.argv.slice(2)) {
  const rel = datei.replace(/\\/g, '/');
  let alt;
  try {
    alt = execSync(`git show HEAD:${rel}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    console.log(`${rel}: neu oder nicht in HEAD – übersprungen`);
    continue;
  }
  const neu = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const a = ohneKommentare(alt, rel).split('\n');
  const b = ohneKommentare(neu, rel).split('\n');
  const i = a.findIndex((z, n) => z !== b[n]);
  if (i === -1 && a.length === b.length) {
    console.log(`${rel}: nur Kommentare`);
  } else {
    abweichung = true;
    const n = i === -1 ? Math.min(a.length, b.length) : i;
    console.log(`${rel}: CODE GEÄNDERT\n   vorher:  ${a[n] ?? '(Ende)'}\n   nachher: ${b[n] ?? '(Ende)'}`);
  }
}
process.exitCode = abweichung ? 1 : 0;
