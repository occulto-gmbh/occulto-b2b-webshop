import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSchema, parse, validate } from "graphql";
import type { RunInput } from "../generated/api";
import { run } from "./run";

function zeile(quantity: number, amount: string, isSingleItem = false, id = "pack"): RunInput["cart"]["lines"][number] {
  return {
    quantity,
    cost: { subtotalAmount: { amount } },
    merchandise: {
      __typename: "ProductVariant",
      id: `gid://shopify/ProductVariant/${id}`,
      product: { isSingleItem },
    },
  };
}

function ergebnis(lines: RunInput["cart"]["lines"]) {
  return run({ cart: { lines } });
}

function rabatt(amount: string, excludedVariantIds: string[] = []) {
  return {
    discountApplicationStrategy: "FIRST",
    discounts: [{
      message: "5% Händlerrabatt",
      targets: [{ orderSubtotal: { excludedVariantIds } }],
      value: { fixedAmount: { amount } },
    }],
  };
}

describe("5 % vom Originalpreis ab 500 Packs", () => {
  it("verwendet eine zum Extension-Schema passende Input-Query", () => {
    const schema = buildSchema(readFileSync(new URL("../schema.graphql", import.meta.url), "utf8"));
    const query = parse(readFileSync(new URL("./run.graphql", import.meta.url), "utf8"));
    expect(validate(schema, query)).toEqual([]);
  });

  it.each([0, 1, 495, 499])("gibt bei %i Packs keinen Rabatt", (packs) => {
    expect(ergebnis(packs ? [zeile(packs, "1525.00")] : []).discounts).toEqual([]);
  });

  it("liefert bei genau 500 Packs einen festen Betrag aus allen Original-Zeilensummen", () => {
    expect(ergebnis([zeile(250, "762.50"), zeile(250, "1000.00", false, "zweiter")]))
      .toEqual(rabatt("88.12"));
  });

  it("liefert auch oberhalb der Schwelle genau 5 %", () => {
    expect(ergebnis([zeile(505, "1540.25")])).toEqual(rabatt("77.01"));
  });

  it("rechnet 1.525 Euro Originalsumme in 76,25 Euro Mengenrabatt um", () => {
    const result = ergebnis([zeile(500, "1525.00")]);
    expect(result).toEqual(rabatt("76.25"));
    // Original minus Sale (10 %) minus fester Mengenrabatt = 1.296,25 Euro.
    const mengenrabattCent = Math.round(Number(result.discounts[0].value.fixedAmount?.amount) * 100);
    expect(152500 - 15250 - mengenrabattCent).toBe(129625);
  });

  it("zaehlt Einzelstuecke und Filialversand nicht zur Schwelle", () => {
    expect(ergebnis([zeile(499, "1521.95"), zeile(10, "9000.00", true, "ausnahme")]).discounts)
      .toEqual([]);
    expect(ergebnis([zeile(500, "9000.00", true)]).discounts).toEqual([]);
  });

  it("schliesst ihre Originalsumme aus und jede Variante nur einmal aus", () => {
    expect(ergebnis([
      zeile(500, "1525.00"),
      zeile(1, "500.00", true, "staender"),
      zeile(2, "1000.00", true, "staender"),
      zeile(1, "99.00", true, "filialversand"),
    ])).toEqual(rabatt("76.25", [
      "gid://shopify/ProductVariant/staender",
      "gid://shopify/ProductVariant/filialversand",
    ]));
  });

  it.each([
    ["1525.19", "76.25"],
    ["1525.20", "76.26"],
    ["4.60", "0.23"],
    ["4.6", "0.23"],
    ["5", "0.25"],
    ["0.19", "0.00"],
  ])("rundet 5 %% von %s auf %s Euro ab", (original, amount) => {
    expect(ergebnis([zeile(500, original)])).toEqual(rabatt(amount));
  });

  it("rundet erst nach dem Addieren der Zeilen ab", () => {
    expect(ergebnis([zeile(250, "0.10"), zeile(250, "0.10", false, "zweiter")]))
      .toEqual(rabatt("0.01"));
  });

  it("ignoriert Warenkorbzeilen ohne ProductVariant", () => {
    const custom = { quantity: 500, cost: { subtotalAmount: { amount: "9000.00" } }, merchandise: { __typename: "CustomProduct" } };
    expect(ergebnis([custom as RunInput["cart"]["lines"][number]]).discounts).toEqual([]);
    expect(ergebnis([zeile(500, "1525.00"), custom as RunInput["cart"]["lines"][number]]))
      .toEqual(rabatt("76.25"));
  });
});
