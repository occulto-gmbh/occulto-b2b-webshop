import type { RunInput, FunctionRunResult } from "../generated/api";
import { DiscountApplicationStrategy } from "../generated/api";

const KEIN_RABATT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/*
 * Händlerrabatt auf Nachbestellungen: 5 % ab 500 Packs im Warenkorb.
 * Am 29.09.2026 mit Occulto festgelegt; er löst die frühere Staffel nach
 * Bestellsumme ab (ab 2.500 € 5 %, ab 5.000 € 10 %, abgestimmt am 2026-09-02).
 *
 * Die 500 Packs zählen über den ganzen Warenkorb: eine Schwelle für die
 * Bestellung, kein Mindestposten. Produkte mit dem Tag einzelstueck oder
 * filialversand-zuschlag zählen nicht mit und werden vom Rabatt
 * ausgeschlossen (wie snippets/b2b-packs.liquid im Theme).
 *
 * Hier steht bewusst NICHTS über Vorordern. Seit dem 30.09.2026 laufen die
 * nicht mehr über den Warenkorb, sondern als E-Mail-Anfrage aus der Maske im
 * Theme; ihre 10 % stehen auf der Rechnung, die Occulto von Hand schreibt.
 * Ein Zweig, der das Warenkorb-Merkmal "Vororder" auswertet, hätte hier nur
 * noch auf Altbestände anspringen können — und dann den falschen Satz
 * gegeben.
 *
 * Die 5 % stehen auch in theme/snippets/b2b-preis.liquid, das den Preis schon
 * in den Übersichten durchgestrichen anzeigt. Weichen sie voneinander ab,
 * steht im Shop ein anderer Preis als an der Kasse.
 */
const SATZ = 5;
const AB_PACKS = 500;

export function run(input: RunInput): FunctionRunResult {
  let packs = 0;
  const excludedVariantIds: string[] = [];
  for (const { quantity, merchandise } of input.cart.lines) {
    if (merchandise.__typename !== "ProductVariant") {
      continue;
    }
    if (merchandise.product.isSingleItem) {
      excludedVariantIds.push(merchandise.id);
    } else {
      packs += quantity;
    }
  }

  if (packs < AB_PACKS) {
    return KEIN_RABATT;
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [
      {
        message: `${SATZ}% Händlerrabatt`,
        targets: [{ orderSubtotal: { excludedVariantIds: [...new Set(excludedVariantIds)] } }],
        value: { percentage: { value: SATZ.toString() } },
      },
    ],
  };
}
