import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="Occulto B2B">
      <s-section heading="Einstellungen">
        <s-stack direction="block" gap="base">
          <s-link href="/app/rabatte">Rabatte</s-link>
          <s-paragraph>Stelle ein, mit welchen Rabatten deine App-Rabatte kombinierbar sind.</s-paragraph>
          <s-link href="/app/dealers">Händler</s-link>
          <s-paragraph>Prüfe offene Händleranfragen und gib Händler frei.</s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
