import type { RunInput, FunctionRunResult } from "../generated/api";
import { DiscountApplicationStrategy } from "../generated/api";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

// Mengenrabatt-Staffeln nach Bestellsumme (netto), mit Occulto am 2026-09-02
// abgestimmt: ab 2.500 € -5%, ab 5.000 € -10%. Höchste erreichte Stufe gewinnt.
const TIERS = [
  { threshold: 5000, percentage: 10 },
  { threshold: 2500, percentage: 5 },
];

// Vororder: fester Satz, unabhängig vom Bestellwert. Am 2026-09-29 mit Occulto
// so entschieden — die Staffel gilt dann NICHT, es wird also nichts addiert.
// Begründung: eine Vororder ist ohnehin an mindestens 500 Packs je Artikel
// gebunden, ein zweiter Mengenanreiz darauf wäre doppelt.
const VORORDER_PROZENT = 10;

export function run(input: RunInput): FunctionRunResult {
  const vororder = input.cart.vororder?.value;

  if (vororder) {
    return {
      discountApplicationStrategy: DiscountApplicationStrategy.First,
      discounts: [
        {
          message: `${VORORDER_PROZENT}% Vororder-Rabatt`,
          targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
          value: { percentage: { value: VORORDER_PROZENT.toString() } },
        },
      ],
    };
  }

  const subtotal = Number(input.cart.cost.subtotalAmount.amount);

  const tier = TIERS.find((t) => subtotal >= t.threshold);
  if (!tier) {
    return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [
      {
        message: `${tier.percentage}% Mengenrabatt`,
        targets: [{ orderSubtotal: { excludedVariantIds: [] } }],
        value: { percentage: { value: tier.percentage.toString() } },
      },
    ],
  };
}
