export interface CombinesWith {
  productDiscounts: boolean;
  orderDiscounts: boolean;
  shippingDiscounts: boolean;
}

export interface AppDiscount {
  id: string;
  title: string;
  status: string;
  combinesWith: CombinesWith;
}

export interface DiscountUserError {
  field: string[] | null;
  message: string;
}

interface AdminClient {
  graphql: (
    query: string,
    options?: { variables: Record<string, unknown> },
  ) => Promise<{ json(): Promise<unknown> }>;
}

export const APP_DISCOUNTS_QUERY = `#graphql
  query appDiscounts($after: String) {
    discountNodes(first: 100, after: $after, query: "method:automatic") {
      nodes {
        id
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title
            status
            combinesWith { productDiscounts orderDiscounts shippingDiscounts }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const UPDATE_APP_DISCOUNT_MUTATION = `#graphql
  mutation updateAppDiscountCombinations($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
      userErrors { field message }
    }
  }
`;

function checkErrors(errors?: { message: string }[]) {
  if (errors?.length) {
    throw new Error(errors.map((error) => error.message).join("; "));
  }
}

export async function loadAppDiscounts(admin: AdminClient): Promise<AppDiscount[]> {
  const discounts: AppDiscount[] = [];
  let after: string | null = null;

  // Auch spätere Seiten laden, damit kein App-Rabatt unbemerkt fehlt.
  do {
    const response = await admin.graphql(APP_DISCOUNTS_QUERY, {
      variables: { after },
    });
    const result = (await response.json()) as {
      data?: {
        discountNodes: {
          nodes: {
            id: string;
            discount:
              | ({ __typename: "DiscountAutomaticApp" } & Omit<AppDiscount, "id">)
              | { __typename: string };
          }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
      errors?: { message: string }[];
    };
    checkErrors(result.errors);
    const connection = result.data?.discountNodes;
    if (!connection) throw new Error("Die Rabatte konnten nicht geladen werden.");
    for (const node of connection.nodes) {
      if (node.discount.__typename === "DiscountAutomaticApp" && "title" in node.discount) {
        const { title, status, combinesWith } = node.discount;
        discounts.push({ id: node.id, title, status, combinesWith });
      }
    }
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    if (connection.pageInfo.hasNextPage && !after) {
      throw new Error("Die nächste Rabattseite konnte nicht geladen werden.");
    }
  } while (after);

  return discounts;
}

export function buildCombinationVariables(id: string, combinesWith: CombinesWith) {
  // Felder einzeln übernehmen, damit Titel, Laufzeit und Rabattlogik unverändert bleiben.
  return {
    id,
    automaticAppDiscount: {
      combinesWith: {
        productDiscounts: combinesWith.productDiscounts,
        orderDiscounts: combinesWith.orderDiscounts,
        shippingDiscounts: combinesWith.shippingDiscounts,
      },
    },
  };
}

export async function updateAppDiscountCombinations(
  admin: AdminClient,
  id: string,
  combinesWith: CombinesWith,
): Promise<DiscountUserError[]> {
  const response = await admin.graphql(UPDATE_APP_DISCOUNT_MUTATION, {
    variables: buildCombinationVariables(id, combinesWith),
  });
  const result = (await response.json()) as {
    data?: { discountAutomaticAppUpdate: { userErrors: DiscountUserError[] } | null };
    errors?: { message: string }[];
  };
  checkErrors(result.errors);
  const payload = result.data?.discountAutomaticAppUpdate;
  if (!payload) throw new Error("Die Einstellungen konnten nicht gespeichert werden.");
  return payload.userErrors;
}
