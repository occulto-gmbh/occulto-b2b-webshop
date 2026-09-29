# Händlerpreis-Function – noch nicht einsatzbereit

Diese Extension ist geschrieben, aber **weder gebaut noch deployt**. Drei
Dinge fehlen, und alle drei brauchen einen Menschen:

1. **Das Variantenfeld anlegen.** Einstellungen → Benutzerdefinierte Daten →
   Varianten → Definition hinzufügen:
   - Namespace und Schlüssel: `occulto.dealer_price`
   - Typ: Dezimalzahl
   - Storefront-Zugriff: **aus**. Sonst liefert die Storefront-API den
     Einkaufspreis wieder aus, und genau das soll die Umstellung verhindern.

2. **Die Preise umstellen.** Die fertige Importdatei liegt im Scratchpad als
   `preistausch.csv` (290 Varianten), der Bericht dazu als `preistausch.md`.
   Sieben Varianten sind bewusst ausgelassen – sechs, bei denen der
   Einkaufspreis über der UVP liegt, und eine ohne UVP.

3. **Schema erzeugen und bauen.**

       cd extensions/dealer-price
       npm install
       npm exec -- shopify app function schema
       npm run typegen
       npm run build

   Das `schema.graphql` ist absichtlich nicht mitkopiert: das der
   Nachbar-Extension gehört zum Ziel `purchase.order-discount.run`, diese
   hier hängt an `purchase.product-discount.run`.

Danach im Shopify-Adminbereich unter Rabatte einen automatischen Rabatt vom
Typ dieser Function anlegen, damit sie greift.

## Was sie tut

Am Produkt steht nach der Umstellung die UVP – eine Zahl, die ohnehin
öffentlich ist. Der Einkaufspreis liegt im Metafeld. Diese Function zieht im
Warenkorb die Differenz ab, aber nur für Kunden mit dem Tag
`dealer-approved`. Im Checkout erscheint sie als Rabattzeile „Händlerpreis".

Kein Wert im Metafeld heißt: es gilt die UVP. Das ist Absicht – lieber zu
teuer als versehentlich verschenkt.
