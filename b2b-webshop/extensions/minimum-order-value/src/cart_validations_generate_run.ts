import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

// Nachbestellungen brauchen mindestens 100 Packs; Einzelstücke zählen nicht.
const MIN_PACKS = 100;

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  const errors: ValidationError[] = [];

  // Erst an der Kasse prüfen, damit der Warenkorb aufgebaut werden kann.
  if (input.buyerJourney.step === "CART_INTERACTION") {
    return { operations: [{ validationAdd: { errors } }] };
  }

  const packs = input.cart.lines.reduce((sum, { quantity, merchandise }) => {
    if (merchandise.__typename !== "ProductVariant" || merchandise.product.isSingleItem) {
      return sum;
    }
    return sum + quantity;
  }, 0);

  // Nur Einzelstücke (z. B. Ständer) dürfen auch allein bestellt werden.
  if (packs > 0 && packs < MIN_PACKS) {
    errors.push({
      message: "Mindestmenge 100 Packs pro Bestellung. Bei abweichenden Liefermengen schreib uns an b2b@occulto.de.",
      target: "$.cart",
    });
  }

  return {
    operations: [
      {
        validationAdd: {
          errors,
        },
      },
    ],
  };
}
