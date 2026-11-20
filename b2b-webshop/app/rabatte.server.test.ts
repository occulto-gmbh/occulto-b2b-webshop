import { describe, expect, it, vi } from "vitest";
import {
  APP_DISCOUNTS_QUERY,
  UPDATE_APP_DISCOUNT_MUTATION,
  loadAppDiscounts,
  updateAppDiscountCombinations,
} from "./rabatte.server";

const combinesWith = {
  productDiscounts: true,
  orderDiscounts: true,
  shippingDiscounts: false,
};
const id = "gid://shopify/DiscountAutomaticNode/123";

describe("Rabatt-Kombinierbarkeit", () => {
  it("sendet ausschließlich combinesWith und die Rabatt-ID", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({ data: { discountAutomaticAppUpdate: { userErrors: [] } } }),
    });
    const input = { ...combinesWith, title: "Nicht ändern", startsAt: "2026-01-01" };
    expect(await updateAppDiscountCombinations({ graphql }, id, input)).toEqual([]);
    expect(graphql).toHaveBeenCalledExactlyOnceWith(UPDATE_APP_DISCOUNT_MUTATION, {
      variables: { id, automaticAppDiscount: { combinesWith } },
    });
  });

  it("listet nur DiscountAutomaticApp-Knoten und lädt alle Seiten", async () => {
    const discount = { __typename: "DiscountAutomaticApp", title: "Mengenrabatt", status: "ACTIVE", combinesWith };
    const graphql = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ data: { discountNodes: {
        nodes: [
          { id: "basic", discount: { __typename: "DiscountAutomaticBasic" } },
          { id: "code", discount: { __typename: "DiscountCodeApp" } },
          { id, discount },
        ],
        pageInfo: { hasNextPage: true, endCursor: "weiter" },
      } } }) })
      .mockResolvedValueOnce({ json: async () => ({ data: { discountNodes: {
        nodes: [{ id: "zweiter", discount }],
        pageInfo: { hasNextPage: false, endCursor: "ende" },
      } } }) });
    expect(await loadAppDiscounts({ graphql })).toEqual([
      { id, title: discount.title, status: discount.status, combinesWith },
      { id: "zweiter", title: discount.title, status: discount.status, combinesWith },
    ]);
    expect(graphql).toHaveBeenNthCalledWith(1, APP_DISCOUNTS_QUERY, { variables: { after: null } });
    expect(graphql).toHaveBeenNthCalledWith(2, APP_DISCOUNTS_QUERY, { variables: { after: "weiter" } });
  });

  it("reicht userErrors unverändert durch", async () => {
    const userErrors = [{ field: ["automaticAppDiscount", "combinesWith"], message: "Nicht erlaubt" }];
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({ data: { discountAutomaticAppUpdate: { userErrors } } }),
    });
    expect(await updateAppDiscountCombinations({ graphql }, id, combinesWith)).toEqual(userErrors);
  });

  it("meldet fehlende Mutationsdaten statt eines falschen Erfolgs", async () => {
    const graphql = vi.fn().mockResolvedValue({ json: async () => ({ data: { discountAutomaticAppUpdate: null } }) });
    await expect(updateAppDiscountCombinations({ graphql }, id, combinesWith)).rejects.toThrow("nicht gespeichert");
  });

  it("meldet GraphQL-Fehler beim Laden und Speichern", async () => {
    const graphql = vi.fn().mockResolvedValue({ json: async () => ({ errors: [{ message: "Keine Berechtigung" }] }) });
    await expect(loadAppDiscounts({ graphql })).rejects.toThrow("Keine Berechtigung");
    await expect(updateAppDiscountCombinations({ graphql }, id, combinesWith)).rejects.toThrow("Keine Berechtigung");
  });
});
