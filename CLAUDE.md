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
6. **Commit** mit dem Warum im Text, auf einem Branch `feature/…` oder `bugfix/…` – nie direkt auf `main`.
   **Danach pushen** (Vorgabe Nico 18.11.2026: alles immer auf GitHub). Für den Branch gibt es einen offenen PR
   gegen `main`; gemergt wird nach Freigabe. Werktags um 17:45 gleicht die geplante Aufgabe
   `b2b-shop-github-abgleich` Repo, Live-Theme und GitHub ab (Theme-Editor-Änderungen werden übernommen).

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
| Menge        | **mindestens 100 Packs pro Bestellung**; 5er-Schritte, Lagerbestand als Grenze | 100 Packs je Artikel/Design, Größen frei kombiniert; je Größe 0 oder ab 5 in 5er (nur Logik, nie im Text); **kein** Mindestbestellwert; **keine** Lagergrenze |
| Rabatt       | 5 % ab 500 Packs im Korb             | 10 % auf die gesamte Vororder                       |
| Versand      | kostenlos ab **250** Packs (Rabatt „Kostenloser Versand“ in der Verwaltung) – Zahl nur in `snippets/b2b-packs.liquid` (`teil: 'versandfrei-ab'`) | immer kostenlos   |
| Länder       | nur Deutschland und Österreich (USt-IdNr. bzw. UID je Land) | |

Stand Besprechung 16.11.2026. Kein Skonto. „Order Deadline“ ist auf der Vororder-Seite gewollt (Feldname der Mail bleibt `Annahmeschluss`).
| Abschluss    | Shopify-Kasse                        | E-Mail über Kontaktformular, Rechnung von Hand      |

- **Einzelstücke** (Tag `einzelstueck`, z. B. Ausstellungsständer): Menge in 1er-Schritten, zählen nicht zu 100/250/500 Packs
  (`snippets/b2b-packs.liquid` zählt die Packs ohne sie), kein −5 %-Hinweis, keine Hangtag-Bilder, nicht in der Vororder.
  Vorgeschlagen über `sections/b2b-vorschlaege.liquid` (Einstellung „Immer vorschlagen“) auf Produktseite und Warenkorb.
  Die Functions kennen die Ausnahme seit 16.11. (getestet, noch nicht ausgerollt).
- Stichtage 15.06 und 15.12, Auslieferung drei Monate später. Einzige Quelle: `snippets/b2b-vororder-termin.liquid`.
- 5 % stehen in `snippets/b2b-preis.liquid` **und** `b2b-webshop/extensions/order-value-discount/src/run.ts` – gleich halten.
- Vororder-Mengen stehen als Einstellungen in **zwei** Abschnitten (Maske und Warenkorb-Übersicht) und in deren
  Vorlagen (`page.b2b-vororder.json`, `cart.json`) – gleich halten. Texte dazu in `b2b-konditionen.liquid`.
- **Mindestmenge Nachbestellung 100 Packs** (Einzelstücke zählen nicht) – einzige Stelle `snippets/b2b-mindestwert.liquid`. Sperrt Kassen-Knopf im Kopf
  (`b2b-korb-art`) und im Fuß (`main-cart-footer`, nach Änderungen per `b2bKasseNachMindestwert` in `assets/cart.js`); das Popup
  hat keinen Kassen-Knopf. Nur im Browser: `/checkout` direkt geht durch, bis `extensions/minimum-order-value` (seit 16.11. auf
  100 Packs umgebaut, getestet) ausgerollt ist. Die Warenkorb-Schublade (`cart-drawer`, derzeit aus) ist nicht gesperrt.
- **Warenkorb nur für freigeschaltete Händler** (seit 17.11.): Shopify hält den Korb per Browser-Cookie auch nach
  dem Abmelden. `main-cart-items` zeigt Gästen und nicht freigeschalteten Konten nur den Anmelde-Hinweis,
  `main-cart-footer` nichts, am Korb-Symbol (`header.liquid`) steht keine Zahl. Der Korb wird nicht geleert.
  `cart-icon-bubble.liquid` (Neuzeichnen nach Korb-Aktionen) prüft dasselbe.
  Serverseitig sperrt `extensions/minimum-order-value` die Kasse ohne Tag `dealer-approved` – erst nach dem Ausrollen.
- Packs zählen ohne Tag `einzelstueck` **und** `filialversand-zuschlag` – im Theme (`b2b-packs`) wie in beiden Functions gleich halten.
- Warenkorb-Kopf der Nachbestellung (`b2b-korb-art`) nennt immer nur die nächste offene Stufe: erst Versand (250 Packs), dann −5 % (500 Packs).
  Balken (Korb und Produktseite, `b2b-groessen-bestellen`): Marken 100 Mindestmenge / 250 versandkostenfrei, Ende 500 −5 %;
  erreichte Stufen voll, nur die Auswahl darüber gestreift.
- **Abverkauf −10 %** (seit 17.11.): Sammlungs-Handle und Prozent nur in `snippets/b2b-abverkauf.liquid`. Nur für Händler:
  Menüpunkt ersetzt „Händler werden“ (in den drei Menü-Snippets, Werte aus `header.liquid`), Abschnitt
  `b2b-abverkauf-abschnitt` unter dem Hero, Popup `#B2bAbverkaufPopup` in `header.liquid` (einmal je Sitzung, wartet auf
  das Cookie-Banner), Abzeichen/Hinweis über `b2b-abverkauf-hinweis`. Alles bleibt unsichtbar, solange die Sammlung leer ist.
  Den Rabatt selbst legt Nico in der Verwaltung an (automatischer Rabatt 10 % auf die Sammlung, kombinierbar) – vorher nicht befüllen.
- Startseite: Hero `sections/b2b-hero.liquid` (Bild rechts, weiß links, zwei Knöpfe; Video möglich, auf Janas Wunsch aus).
  Produktseite: Brotkrumen `sections/b2b-pfad.liquid`. Menüpunkt „Vororder“ über Theme-Einstellungen `b2b_vororder_*`.
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


- Functions gebaut und getestet, **nicht ausgerollt**: `shopify app deploy` wirkt sofort live, nur auf Zuruf.
  Build braucht pnpm (corepack), siehe `b2b-webshop/extensions/HINWEIS-DEPLOY.md`.
