import type { RunInput, FunctionRunResult } from "../generated/api";
import { DiscountApplicationStrategy } from "../generated/api";

const KEIN_RABATT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/*
 * Zwei Bestellarten, zwei feste Sätze — am 29.09.2026 mit Occulto festgelegt:
 *
 *   Nachbestellung   5 %   ab 500 Packs im Warenkorb, Ware aus dem Lager
 *   Vororder        10 %   ohne weitere Bedingung, Ware aus der Produktion
 *
 * Die 500 Packs zählen bei der Nachbestellung über den ganzen Warenkorb: es
 * ist eine Schwelle für die Bestellung, kein Mindestposten. Bei der Vororder
 * dagegen gilt die Mindestmenge je Artikel, und die prüft
 * pack-quantity-rule — hier wäre sie doppelt.
 *
 * Damit ist die frühere Staffel nach Bestellsumme (ab 2.500 € 5 %, ab
 * 5.000 € 10 %, abgestimmt am 2026-09-02) abgelöst.
 *
 * Dieselben Zahlen stehen im Theme in snippets/b2b-preis.liquid, das den
 * Preis schon in der Liste durchgestrichen anzeigt. Weichen sie voneinander
 * ab, steht im Shop ein anderer Preis als im Checkout.
 */
const SATZ_NACHBESTELLUNG = 5;
const SATZ_VORORDER = 10;
const NACHBESTELLUNG_AB_PACKS = 500;

export function run(input: RunInput): FunctionRunResult {
  const istVororder = Boolean(input.cart.vororder?.value);

  let satz: number;
  let text: string;

  if (istVororder) {
    satz = SATZ_VORORDER;
    text = "Vororder-Rabatt";
  } else {
    const packs = input.cart.lines.reduce((summe, zeile) => summe + zeile.quantity, 0);
    if (packs < NACHBESTELLUNG_AB_PACKS) {
      return KEIN_RABATT;
    }
    satz = SATZ_NACHBESTELLUNG;
    text = "Händlerrabatt";
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [
      {
        message: `${satz}% ${text}`,
        targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
        value: { percentage: { value: satz.toString() } },
      },
    ],
  };
}
