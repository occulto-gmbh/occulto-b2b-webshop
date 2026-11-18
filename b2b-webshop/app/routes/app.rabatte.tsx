import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { loadAppDiscounts, updateAppDiscountCombinations } from "../rabatte.server";
import type { AppDiscount, CombinesWith } from "../rabatte.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return { discounts: await loadAppDiscounts(admin) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { success: false, userErrors: [{ field: null, message: "Die Rabatt-ID fehlt." }] };
  }
  try {
    const userErrors = await updateAppDiscountCombinations(admin, id, {
      productDiscounts: formData.get("productDiscounts") === "true",
      orderDiscounts: formData.get("orderDiscounts") === "true",
      shippingDiscounts: formData.get("shippingDiscounts") === "true",
    });
    return { success: userErrors.length === 0, userErrors };
  } catch {
    return {
      success: false,
      userErrors: [{ field: null, message: "Die Einstellungen konnten nicht gespeichert werden. Bitte versuche es erneut." }],
    };
  }
};

const combinationLabels: Record<keyof CombinesWith, string> = {
  productDiscounts: "Produktrabatte",
  orderDiscounts: "Bestellrabatte",
  shippingDiscounts: "Versandrabatte",
};
const statusLabels: Record<string, string> = {
  ACTIVE: "Aktiv",
  SCHEDULED: "Geplant",
  EXPIRED: "Abgelaufen",
};

function DiscountSettings({ discount }: { discount: AppDiscount }) {
  const fetcher = useFetcher<typeof action>();
  const [combinesWith, setCombinesWith] = useState(discount.combinesWith);
  const [edited, setEdited] = useState(false);
  const saving = fetcher.state !== "idle";

  const save = () => {
    setEdited(false);
    fetcher.submit({
      id: discount.id,
      productDiscounts: String(combinesWith.productDiscounts),
      orderDiscounts: String(combinesWith.orderDiscounts),
      shippingDiscounts: String(combinesWith.shippingDiscounts),
    }, { method: "POST" });
  };

  return (
    <s-section heading={discount.title}>
      <s-stack direction="block" gap="base">
        <s-paragraph>Status: {statusLabels[discount.status] ?? "Unbekannt"}</s-paragraph>
        <s-heading>Kombinierbar mit</s-heading>
        {(Object.keys(combinationLabels) as (keyof CombinesWith)[]).map((field) => (
          <s-checkbox
            key={field}
            label={combinationLabels[field]}
            checked={combinesWith[field]}
            disabled={saving}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setCombinesWith((previous) => ({ ...previous, [field]: checked }));
              setEdited(true);
            }}
          />
        ))}
        <s-button onClick={save} disabled={saving} {...(saving ? { loading: true } : {})}>
          Speichern
        </s-button>
        <div aria-live="polite">
          {!saving && !edited && fetcher.data?.success && (
            <s-paragraph>Einstellungen gespeichert.</s-paragraph>
          )}
          {!saving && fetcher.data?.userErrors.map((error, index) => (
            <s-paragraph key={index}>{error.message}</s-paragraph>
          ))}
        </div>
      </s-stack>
    </s-section>
  );
}

export default function Rabatte() {
  const { discounts } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Rabatte">
      <s-paragraph>Shopify kombiniert zwei Rabatte nur, wenn beide es erlauben.</s-paragraph>
      {discounts.length === 0 ? (
        <s-section heading="Automatische App-Rabatte">
          <s-paragraph>Keine automatischen App-Rabatte gefunden.</s-paragraph>
        </s-section>
      ) : discounts.map((discount) => (
        <DiscountSettings key={discount.id} discount={discount} />
      ))}
    </s-page>
  );
}
