# Functions – Stand und Ausrollen

Stand 30.09.2026. Gebaut und getestet, **nicht ausgerollt**.

## Was gilt

| Function | Regel |
|---|---|
| `order-value-discount` | 5 % auf den Warenkorb ab 500 Packs, sonst nichts |
| `pack-quantity-rule` | Mengen in 5er-Schritten, außer beim exakten Restbestand |

Vorordern laufen **nicht** über den Warenkorb und brauchen keine Function – sie gehen als
E-Mail-Anfrage aus dem Theme (`theme/sections/b2b-vororder-*.liquid`), die 10 % stehen auf der Rechnung.
Die frühere Staffel nach Bestellwert (ab 2.500 € 5 %, ab 5.000 € 10 %) ist abgelöst.

Die 5 % und die 500 stehen auch in `theme/snippets/b2b-preis.liquid` und `theme/snippets/b2b-korb-art.liquid`,
die sie im Shop anzeigen. Beides gleich halten.

## Bauen und testen

Das Projekt ist ein **pnpm**-Workspace; die Shopify CLI ruft intern `pnpm exec` auf. Ohne globale Installation:

```bash
corepack enable --install-directory /pfad/zum/shim pnpm
PATH="/pfad/zum/shim:$PATH" npm run typegen      # je Erweiterung
npx vitest run                                    # je Erweiterung
```

Nicht `npm install` in diesem Projekt – das schreibt eine `package-lock.json`, die hier niemand liest.

Zuletzt grün: `pack-quantity-rule` 4 Fälle, `order-value-discount` 2 Fälle.

## Ausrollen

```bash
shopify app deploy
```

Wirkt **sofort im Live-Shop**. Nur auf ausdrücklichen Zuruf. Welche Fassung dort heute läuft, ist von außen
nicht sicher zu sagen – der Rabattbetrag im Warenkorb passt zur alten Staffel wie zur neuen Regel.
