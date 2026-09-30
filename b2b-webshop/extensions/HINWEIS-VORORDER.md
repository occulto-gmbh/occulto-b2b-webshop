# Vororder – Stand und was noch fehlt

Stand 30.09.2026. Der Code ist geschrieben, **gebaut und getestet** – aber
**nicht ausgerollt**. Solange der Deploy fehlt, zeigt der Shop die neuen
Regeln an, während die Kasse noch nach den alten rechnet.

## Was gilt

|  | Nachbestellung | Vororder |
|---|---|---|
| Rabatt | 5 % ab 500 Packs im Warenkorb | 10 %, ohne weitere Bedingung |
| Mindestmenge | keine | 500 Packs **je Artikel** |
| Lieferung | aus dem Lager | aus der Produktion nach dem Annahmeschluss |
| Bestandsprüfung | ja | nein |

Ein Warenkorb ist immer nur eines von beiden. Erkannt wird es am
Warenkorb-Merkmal `Vororder`, das die Maske im Theme setzt
(`sections/catalog-order-list.liquid`, Betriebsart `b2b_vororder`).

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `order-value-discount/src/run.graphql` | liest `Vororder` und die Mengen je Position |
| `order-value-discount/src/run.ts` | feste Sätze statt Staffel nach Bestellwert |
| `pack-quantity-rule/src/cart_validations_generate_run.graphql` | liest `Vororder` |
| `pack-quantity-rule/src/cart_validations_generate_run.ts` | 500 je Position bei Vororder; Bestandsprüfung nur ohne Vororder |

Die Prozentsätze stehen an einer zweiten Stelle, die dazu passen muss:
`theme/snippets/b2b-preis.liquid`. Weichen sie voneinander ab, steht im Shop
ein anderer Preis als an der Kasse.

## Was geprüft ist

Beide Erweiterungen bauen und alle Tests laufen durch (30.09.2026):

- `pack-quantity-rule` – 7 Fälle, darunter neu: Vororder unter der
  Mindestmenge wird abgelehnt, Vororder über dem Bestand wird erlaubt,
  Nachbestellung über dem Bestand wird abgelehnt.
- `order-value-discount` – 4 Fälle: unter 500 Packs kein Rabatt, ab 500
  Packs 5 %, Vororder 10 % unabhängig von der Menge.

Die drei alten Fixtures der Bestellwert-Staffel sind entfernt – die Regel
gibt es nicht mehr, und die Eingabeabfrage fragt die Bestellsumme auch nicht
mehr ab.

## pnpm

Das Projekt ist ein **pnpm**-Workspace, und die Shopify CLI ruft intern
`pnpm exec` auf. Ohne pnpm im Pfad bricht schon `typegen` ab. Ohne globale
Installation geht es so:

```bash
corepack enable --install-directory /pfad/zum/shim pnpm
PATH="/pfad/zum/shim:$PATH" npm run typegen
```

Nicht `npm install` in diesem Projekt benutzen – das schreibt eine
`package-lock.json`, die hier niemand liest.

## Der Deploy

```bash
shopify app deploy
```

**Das wirkt sofort im Live-Shop.**

Danach, und erst danach: die Varianten in der Shopify-Verwaltung auf
**„Weiterverkaufen, wenn nicht vorrätig"** umstellen (Produkte → alle
auswählen → Massenbearbeitung). Ohne diese Umstellung kürzt Shopify jede
Vororder auf den heutigen Bestand, unabhängig von Theme und Functions.

Die Reihenfolge ist wichtig: andersherum gibt es ein Fenster, in dem jeder
Lagerware überbuchen kann, weil die neue Bestandsprüfung noch nicht läuft.

## Bekannte Schwäche

Das Merkmal hängt am **ganzen Warenkorb**, nicht an einzelnen Positionen.
Der Weg, den die Maske zum Warenkorb nimmt – `/cart/update.js` mit
`updates[]` – kann keine Positions-Merkmale setzen. Ein Umbau darauf wäre
ein eigenes Stück Arbeit.

Bis dahin: die Maske fragt nach, bevor sie einen vorhandenen Warenkorb
umwidmet, und ein leerer Warenkorb räumt das Merkmal selbst wieder auf.
