import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

// Occulto sells in packs. Dealers must order in steps of 5 packs — except
// right at the end of a variant's stock, where ordering the exact remaining
// quantity is allowed even if it isn't a multiple of 5 (e.g. 3 packs left).
//
// Shopify Functions can't query live inventory directly, so the exact
// remaining quantity is read from a variant metafield
// (app--416332316673.available_quantity) that a webhook keeps mirrored to
// the variant's real Shopify inventory on every stock change
// (see app/routes/webhooks.inventory_levels.update.tsx).
const PACK_STEP = 5;

// Vororder: mindestens 500 Packs je Position. Am 2026-09-29 mit Occulto so
// entschieden - "je" heisst pro Artikel, nicht in Summe. Die Maske im Theme
// setzt min=500 auf die Eingabefelder und sperrt den Warenkorbknopf; das hier
// ist die Absicherung dahinter, weil ein Eingabefeld niemand daran hindert,
// direkt an /cart/add zu posten.
const VORORDER_MINDESTMENGE = 500;

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  const errors: ValidationError[] = [];

  // Only enforce at checkout, not while the cart is still being built up
  // (mirrors the minimum-order-value function's reasoning: a single unit
  // added to an otherwise-empty cart would otherwise always fail).
  if (input.buyerJourney.step === "CART_INTERACTION") {
    return { operations: [{ validationAdd: { errors } }] };
  }

  const istVororder = Boolean(input.cart.vororder?.value);

  input.cart.lines.forEach((line) => {
    const { quantity, merchandise } = line;

    if (istVororder && quantity < VORORDER_MINDESTMENGE) {
      const name =
        merchandise.__typename === "ProductVariant"
          ? [merchandise.product.title, merchandise.title].filter(Boolean).join(" – ")
          : "Ein Artikel";

      errors.push({
        message: `${name}: Eine Vororder braucht mindestens ${VORORDER_MINDESTMENGE} Packs je Artikel. Aktuelle Menge: ${quantity}.`,
        target: "$.cart",
      });
    }

    if (quantity % PACK_STEP === 0) {
      return;
    }

    if (merchandise.__typename !== "ProductVariant") {
      return;
    }

    const availableRaw = merchandise.availableQuantityMetafield?.value;
    const available = availableRaw != null ? Number(availableRaw) : null;

    // Allow a non-multiple-of-5 quantity only if it exactly matches the
    // true remaining stock (buying out the last few packs).
    if (available != null && quantity === available) {
      return;
    }

    const productName = [merchandise.product.title, merchandise.title]
      .filter(Boolean)
      .join(" – ");

    errors.push({
      message: `${productName || "Ein Artikel"}: Bitte in 5er-Schritten bestellen (5, 10, 15, ...). Aktuelle Menge: ${quantity}.`,
      target: "$.cart",
    });
  });

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
