# Occulto B2B-Shop (b2b.occulto.de)

Antworten auf Deutsch. Store `ri1udz-iw.myshopify.com`, Basic-Plan (kein Shopify B2B/Companies).
`theme/` = das Theme, `b2b-webshop/` = Martins Shopify-App (pnpm-Workspace, siehe `b2b-webshop/AGENTS.md`).

Live-Theme: **„B2B - Pipeline 29.09", ID 202519675144**. Änderungen am Theme sind sofort live –
für diesen Shop vom Nutzer ausdrücklich erlaubt. Nie `shopify theme publish`.

## Arbeitsweise – jede Aufgabe

1. **Konzept zuerst.** Auftrag in 3–6 Zeilen zurückgeben, bei zwei Varianten als Tabelle.
   Nur fragen, wenn die Antwort den Bau grundlegend ändert – sonst Annahme nennen und bauen.
2. **Bestand vor Bau.** Per grep prüfen, ob es Snippet, Section oder Regel schon gibt. Nichts doppelt.
3. **Bauen.** Kleinste Änderung, die den Auftrag erfüllt. Geteilte Theme-Dateien nur wenn nötig, im Bericht nennen.
4. **Prüfen.**
   - Nach jeder Änderung `node werkzeuge/pruefen.mjs` (mit `--schnell` ohne den 1–3 Minuten langen
     Theme Check): JS-Syntax, kaputte Regex, uneinheitliche Geschäftszahlen, verwaiste Snippets. Skript statt
     Agent – ein Haiku-Probelauf brauchte 84.000 Tokens und fand einen von vier Befunden.
   - Subagent `texter` (Sonnet), wenn sichtbarer Kundentext geändert wurde.
   - Subagent `gegenleser` (Sonnet) bei Logik (Warenkorb, Preise, Rabatt, Vororder) oder Diffs über ~100 Zeilen.
   - Lässt man einen Agenten Kommentare umschreiben: `node werkzeuge/nur-kommentare.mjs <dateien>` belegt,
     dass außerhalb der Kommentare kein Zeichen geändert wurde.
   Befunde von Agenten selbst nachprüfen, bevor sie umgesetzt oder weitergegeben werden.
   Im Bericht nennen, welche Prüfungen liefen und was die Agenten gekostet haben (Tokens aus der Rückmeldung).
   Das gilt für jeden größeren Auftrag – vom Nutzer am 30.09.2026 so verlangt.
5. **Messen, nicht schätzen.** Im Browser per JS bei 1440 und 375 px: Maße, Querüberlauf, berechnete
   Stile, echte Serverantworten. Screenshot nur als Beleg am Ende.
6. **Commit** mit dem Warum im Text. Kein Push – keine Schreibrechte auf GitHub (Stand 30.09.2026).

## Vorschau

```
cd theme && shopify theme dev --store ri1udz-iw.myshopify.com --theme 202519675144 --port 9292
```
Synchronisiert jede gespeicherte Datei sofort ins Live-Theme. Logdatei nicht in `theme/` schreiben.

Händleransicht: Preise, Vororder und Warenkorb-Blöcke hängen an `customer.tags contains 'dealer-approved'`,
auch in der Vorschau. Zum Testen `theme/` in einen Temp-Ordner kopieren, dort die Sperre aufheben und mit
`shopify theme dev --port 9293` (ohne `--theme`, legt ein privates Entwicklungs-Theme an) prüfen.
Nie im Live-Theme aufheben.

## Fallen – alle schon passiert

- Shopify liefert CSS/JS **verkleinert** aus, Kommentare fehlen. „Ist es live?" am Code prüfen, nicht am Kommentar.
- `render` hat einen eigenen Gültigkeitsbereich. Snippets **geben Text aus** (Vorbild `b2b-vororder-termin`).
- Backslashes gehen verloren, wenn JS über Node-Heredoc oder Template-Literal eingefügt wird (`/\d/` → `/d/`).
  Regex immer mit dem Edit-Werkzeug schreiben.
- `perl -i` und `sed -i` legen Zwischendateien im überwachten Ordner an → die Vorschau hängt mit
  „Failed to Upload Theme Files" und lädt nichts mehr hoch. In `theme/` nur mit dem Edit-Werkzeug ändern.
- Jede gespeicherte Datei in `theme/` geht sofort live. Probeänderungen und Gegenproben nie dort, sondern an
  einer Kopie außerhalb.
- In Liquid ist `0` wahr: `0 | default: 5` bleibt `0`. Leer lassen statt 0 vorbelegen.
- JSON-Templates haben einen `/* */`-Kopf: abtrennen, parsen, wieder voranstellen. Keine Kommentare mitten im JSON.
- `url`-Settings nehmen keinen Text als `default`.
- Grundschrift 62.5 % → `1rem` = 10 px. Liquid bekommt höchstens 50 Produkte je Seite; URL-Parameter sind in Liquid nicht lesbar.
- `cart.js` wertet Shopifys 422 „nur N Artikel" aus und setzt die Zeile auf N – nicht zurückbauen.

## Fachliche Regeln

|              | Nachbestellung                       | Vororder                                            |
|--------------|--------------------------------------|-----------------------------------------------------|
| Korb         | Shopify-Warenkorb                    | eigener Korb im Browser (`localStorage` `b2b-vororder`) |
| Menge        | 5er-Schritte, Lagerbestand als Grenze | je Größe 0 oder ab 5, in 5er; je Artikel (alle Größen) ab 100; gesamt ab 1.500 € nach Rabatt; **keine** Lagergrenze |
| Rabatt       | 5 % ab 500 Packs im Korb             | immer 10 %                                          |
| Versand      | kostenlos ab 300 Packs (Rabatt „Kostenloser Versand“ in der Verwaltung) | immer kostenlos   |
| Abschluss    | Shopify-Kasse                        | E-Mail über Kontaktformular, Rechnung von Hand      |

- **Einzelstücke** (Tag `einzelstueck`, z. B. Ausstellungsständer): Menge in 1er-Schritten, zählen nicht zu 300/500 Packs
  (`snippets/b2b-packs.liquid` zählt die Packs ohne sie), kein −5 %-Hinweis, keine Hangtag-Bilder, nicht in der Vororder.
  Vorgeschlagen über `sections/b2b-vorschlaege.liquid` (Einstellung „Immer vorschlagen“) auf Produktseite und Warenkorb.
  Die Functions `order-value-discount` und `pack-quantity-rule` kennen die Ausnahme noch nicht – vor dem Ausrollen nachziehen.
- Stichtage 15.06 und 15.12, Auslieferung drei Monate später. Einzige Quelle: `snippets/b2b-vororder-termin.liquid`.
- 5 % stehen in `snippets/b2b-preis.liquid` **und** `b2b-webshop/extensions/order-value-discount/src/run.ts` – gleich halten.
- Vororder-Mengen stehen als Einstellungen in **zwei** Abschnitten (Maske und Warenkorb-Übersicht) und in deren
  Vorlagen (`page.b2b-vororder.json`, `cart.json`) – gleich halten. Texte dazu in `b2b-konditionen.liquid`.
- Warenkorb-Kopf der Nachbestellung (`b2b-korb-art`) nennt immer nur die nächste offene Stufe: erst Versand (300 Packs), dann −5 % (500 Packs).
- Vororder: `sections/b2b-vororder-maske.liquid` (Auswahl), `sections/b2b-vororder-korb.liquid` (Übersicht auf /cart),
  Logik in `assets/b2b-vororder.js`. Nachbestellung-Kopf: `snippets/b2b-korb-art.liquid`.

## Sprache und Gestaltung

- Du-Form, kurze konkrete Sätze. Vorbild: Hauptshop-Landingpage `/pages/personalisierte-socken-mit-logo`.
- Begriffe: Packs (nicht Stück/Paar), Nachbestellung, Vororder, Annahmeschluss, Auslieferung, Händlerpreis.
- Hausschrift basic-sans (Adobe-Kit `wdu6knh`, Snippet `brand-schrift`), nur 400 und 700.
- Keine Versal-Etiketten, keine Etiketten über Überschriften, Rot nur deckend (Linie, Knopf, Abzeichen) – Flächen
  neutral grau oder weiß. Zierelemente nur mit Information; Bewegung sparsam. Für Gestaltung den Skill
  `frontend-design` laden – aber die Marke steht fest, keine neue Bildsprache erfinden.

## Offen (Stand 30.09.2026)


- `main` liegt lokal mehrere Commits vor `origin`, Push erst mit Schreibrechten.
- Functions gebaut und getestet, **nicht ausgerollt**: `shopify app deploy` wirkt sofort live, nur auf Zuruf.
  Build braucht pnpm (corepack), siehe `b2b-webshop/extensions/HINWEIS-DEPLOY.md`.
