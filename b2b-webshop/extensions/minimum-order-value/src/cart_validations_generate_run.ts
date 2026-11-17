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

  // Bestellen nur mit freigeschaltetem Händlerkonto (17.11.2026). Der
  // Warenkorb hängt an einem Browser-Cookie und bleibt nach dem Abmelden
  // bestehen; das Theme blendet ihn für Gäste aus, /checkout direkt ginge
  // aber sonst durch – auch zu Händlerpreisen.
  if (!input.cart.buyerIdentity?.customer?.isDealer) {
    errors.push({
      message: "Bestellen kannst du nur mit freigeschaltetem Händlerkonto. Bitte melde dich an.",
      target: "$.cart",
    });
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
