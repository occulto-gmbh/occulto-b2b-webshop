# Functions – Stand und Ausrollen

Stand 16.11.2026. Für die neuen Konditionen angepasst, **nicht ausgerollt**.

## Was gilt

| Function | Regel |
|---|---|
| `minimum-order-value` | Mindestens 100 Packs pro Bestellung an der Kasse; Einzelstücke zählen nicht mit. Bestellungen nur mit Einzelstücken sind erlaubt. |
| `order-value-discount` | 5 % ab 500 Packs im Warenkorb; Einzelstücke zählen nicht mit und werden nicht rabattiert. |
| `pack-quantity-rule` | Je Größe in 5er-Schritten, außer beim exakten Restbestand; Einzelstücke in 1er-Schritten. |

Einzelstücke sind Produkte mit dem Tag `einzelstueck` (z. B. Ständer).
Die Mindestmengenprüfung ersetzt den früheren Mindestbestellwert von 500 €.
Namen, Handles und UIDs der Erweiterungen bleiben erhalten, damit bestehende Zuordnungen erhalten bleiben.

**Versandkostenfrei ab 250 Packs** ist ein Rabatt in der Shopify-Verwaltung, keine Function.
Diese Einstellung wurde hier nicht geändert; vor dem Ausrollen separat prüfen.

Vorordern laufen **nicht** über den Warenkorb und brauchen keine Function – sie gehen als
E-Mail-Anfrage aus dem Theme (`theme/sections/b2b-vororder-*.liquid`), die 10 % stehen auf der Rechnung.
Die frühere Staffel nach Bestellwert (ab 2.500 € 5 %, ab 5.000 € 10 %) ist abgelöst.

Die 5 % und die 500 stehen auch in `theme/snippets/b2b-preis.liquid` und `theme/snippets/b2b-korb-art.liquid`,
die sie im Shop anzeigen. Beides gleich halten.

## Bauen und testen

Das Projekt ist ein **pnpm**-Workspace; die Shopify CLI ruft intern `pnpm exec` auf. Ohne globale Installation:

```bash
corepack enable --install-directory /pfad/zum/shim pnpm
export PATH="/pfad/zum/shim:$PATH"
npm run typegen       # je Erweiterung
npm run build         # je Erweiterung, nur lokales WASM
npx vitest run        # je Erweiterung
```

Unter Windows die `.cmd`-Varianten verwenden (`npm.cmd`, `npx.cmd`), falls PowerShell Skripte sperrt.
Der Shim-Ordner muss während Typegen, Build und Tests im `PATH` bleiben.
Die Integrationstests bauen die Function erneut und prüfen GraphQL-Ein- und Ausgabe sowie das WASM-Ergebnis.

Nicht `npm install` in diesem Projekt – das schreibt eine `package-lock.json`, die hier niemand liest.

Die Fixtures decken insbesondere 99/100 Packs, Einzelstücke und gemischte Warenkörbe,
499/500 Packs beim Rabatt sowie 5er-Schritte und den exakten Restbestand ab.

Prüfstand 16.11.2026 im Worktree `functions-100packs`:
- Corepack/pnpm 9.15.9 und Typegen für alle drei Erweiterungen erfolgreich.
- TypeScript (`strict`) sowie GraphQL-Abfragen, Fixture-Ein-/Ausgaben und direkte JavaScript-Ausführung
  erfolgreich: `minimum-order-value` 9 Fälle, `order-value-discount` 8, `pack-quantity-rule` 11.
- **WASM-Build und Vitest noch offen:** esbuild scheitert in der Sandbox mit
  `Cannot read directory "../../../..": Access is denied.` bereits beim Auflösen der Quelldateien
  bzw. Laden der Vitest-Konfiguration. Die direkten Fixture-Prüfungen ersetzen den WASM-Integrationstest nicht.
  Vor dem Ausrollen die obigen Build-/Testbefehle in einer Umgebung mit passenden Leserechten wiederholen.

## Ausrollen

`shopify app deploy` wirkt **sofort im Live-Shop** und rollt **alle Erweiterungen** aus.
Vorher die nicht committierten Änderungen im Hauptordner an
`b2b-webshop/extensions/dealer-price/shopify.extension.toml` klären.
Nicht ungeprüft zusammen mit den drei hier bearbeiteten Functions ausrollen.

In diesem Auftrag sind **`shopify app deploy` und `shopify app dev` verboten**.
Ein späteres Ausrollen braucht einen ausdrücklichen Auftrag. Welche Fassung derzeit live läuft,
wurde hier nicht geprüft.
