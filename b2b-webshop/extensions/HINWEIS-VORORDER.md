# Vororder – was noch fehlt

Stand 29.09.2026. Der Code ist geschrieben, aber **nicht gebaut, nicht
getestet und nicht ausgerollt**. Ohne diese drei Schritte ändert sich im
Shop nichts.

## Was geändert wurde

| Datei | Änderung |
|---|---|
| `order-value-discount/src/run.graphql` | liest das Warenkorb-Merkmal `Vororder` |
| `order-value-discount/src/run.ts` | Merkmal gesetzt → fest 10 %, Bestellwert-Staffel gilt dann nicht |
| `pack-quantity-rule/src/cart_validations_generate_run.graphql` | liest dasselbe Merkmal |
| `pack-quantity-rule/src/cart_validations_generate_run.ts` | Merkmal gesetzt → jede Position mindestens 500 Packs |

Das Merkmal setzt das Theme: `sections/catalog-order-list.liquid` in der
Betriebsart `b2b_vororder` schreibt beim Betreten der Maske
`attributes[Vororder] = "<Stichtag>"` in den Warenkorb.

## Was vor dem Ausrollen passieren muss

1. `npm install` in beiden Erweiterungen – es liegen keine `node_modules`.
2. `npm run typegen` – `input.cart.vororder` steht noch nicht in
   `generated/api.ts`. Ohne Typgenerierung schlägt der Build fehl.
3. `npm test` in `pack-quantity-rule`. Die vorhandenen Fixtures haben kein
   Merkmal, laufen also weiter wie bisher; eine Fixture mit Merkmal und einer
   Position unter 500 fehlt noch.
4. `shopify app deploy` – das rollt die Erweiterungen aus. **Das wirkt sofort
   im Live-Shop** und ist nichts, was nebenbei passiert.

## Bekannte Schwäche

Das Merkmal hängt am **ganzen Warenkorb**, nicht an einzelnen Positionen. Wer
die Vororder-Maske besucht und danach im normalen Katalog weiterklickt, hat
beides in einem Warenkorb – und bekommt auf alles 10 % sowie die
500-Packs-Pflicht auf jede Position.

Sauberer wäre ein Merkmal je Position. Das geht aber nicht, solange die Maske
`quick-order-list.js` benutzt: die schickt `updates[]` an `/cart/update`, und
dieser Weg kennt keine Positions-Merkmale. Ein Umbau darauf wäre ein eigenes
Stück Arbeit.

Bis dahin hilft die Sichtbarkeit: der Stichtag steht als Merkmal im Warenkorb
und später in der Bestellung, ist also in der Verwaltung und in der Wawi zu
sehen.
