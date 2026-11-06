import type { RunInput, FunctionRunResult } from '../generated/api';
import { DiscountApplicationStrategy } from '../generated/api';

const KEIN_RABATT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/**
 * Haendlerpreis je Position.
 *
 * Warum es diese Function gibt: an einem Produkt steht in Shopify genau ein
 * Preis, und den liefert /products.json an jeden aus - ohne Anmeldung, ohne
 * dass Theme oder App etwas dagegen tun koennen. Solange dort der
 * Einkaufspreis stand, war der Shop nur hinter dem Passwort sicher.
 *
 * Seit der Umstellung steht am Produkt die UVP. Der Einkaufspreis liegt im
 * Variantenfeld occulto.dealer_price, das keinen Storefront-Zugriff hat.
 * Diese Function holt ihn im Warenkorb wieder hervor - aber nur fuer Kunden
 * mit dem Tag dealer-approved.
 *
 * Gerechnet wird als Abschlag je Stueck: oeffentlicher Preis minus
 * Haendlerpreis. Shopify kennt keinen "setze den Preis auf"-Befehl, nur
 * Rabatte; das Ergebnis ist dasselbe, steht im Checkout aber als Rabattzeile.
 */
export function run(input: RunInput): FunctionRunResult {
  const kunde = input.cart.buyerIdentity?.customer;
  const freigegeben = kunde?.hasTags?.some((t) => t.tag === 'dealer-approved' && t.hasTag);
  if (!freigegeben) {
    return KEIN_RABATT;
  }

  const rabatte = [];

  for (const zeile of input.cart.lines) {
    if (zeile.merchandise.__typename !== 'ProductVariant') continue;

    const roh = zeile.merchandise.metafield?.value;
    if (!roh) continue;

    const haendlerpreis = Number(roh);
    const oeffentlich = Number(zeile.cost.amountPerQuantity.amount);

    /* Unbrauchbare oder unplausible Werte lieber auslassen als raten: ein
       Rabatt von null waere unnoetig, ein negativer wuerde den Preis
       erhoehen, und ohne gepflegtes Feld gilt schlicht die UVP. */
    if (!Number.isFinite(haendlerpreis) || haendlerpreis <= 0) continue;
    if (haendlerpreis >= oeffentlich) continue;

    const abschlag = oeffentlich - haendlerpreis;

    rabatte.push({
      message: 'Händlerpreis',
      targets: [{ cartLine: { id: zeile.id } }],
      value: {
        fixedAmount: {
          amount: abschlag.toFixed(2),
          /* Je Stueck, nicht je Position - sonst haengt der Preis an der
             Bestellmenge. */
          appliesToEachItem: true,
        },
      },
    });
  }

  if (rabatte.length === 0) {
    return KEIN_RABATT;
  }

  return {
    /* First statt Maximum: der Haendlerpreis ist kein Angebot, das mit
       anderen konkurriert, sondern der Ausgangspreis. Die Mengenstaffel aus
       order-value-discount greift danach auf die Bestellsumme. */
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: rabatte,
  };
}
