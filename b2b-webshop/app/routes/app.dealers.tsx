import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Admin approval screen for pending dealer registrations.
// Spec: docs/master-prompt.md sections 6 and 55.

const NS = "app--416332316673";

const PENDING_CUSTOMERS_QUERY = `#graphql
  query pendingDealers {
    customers(first: 50, query: "tag:dealer-pending") {
      nodes {
        id
        displayName
        email
        phone
        defaultAddress { address1 city zip country company }
        legalForm: metafield(namespace: "${NS}", key: "legal_form") { value }
        vatId: metafield(namespace: "${NS}", key: "vat_id") { value }
        contactPosition: metafield(namespace: "${NS}", key: "contact_position") { value }
        companyWebsite: metafield(namespace: "${NS}", key: "company_website") { value }
        salesMode: metafield(namespace: "${NS}", key: "sales_mode") { value }
        registrationMessage: metafield(namespace: "${NS}", key: "registration_message") { value }
      }
    }
  }
`;

interface PendingDealer {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  defaultAddress: { address1: string; city: string; zip: string; country: string; company: string } | null;
  legalForm: { value: string } | null;
  vatId: { value: string } | null;
  contactPosition: { value: string } | null;
  companyWebsite: { value: string } | null;
  salesMode: { value: string } | null;
  registrationMessage: { value: string } | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(PENDING_CUSTOMERS_QUERY);
  const data = await response.json();
  return { dealers: data.data.customers.nodes as PendingDealer[] };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const customerId = formData.get("customerId")?.toString();

  if (!customerId) {
    return { error: "Missing customerId" };
  }

  // 1. Kunde laden ---------------------------------------------------------

  let customer: {
    id: string;
    displayName: string;
    email: string;
    defaultAddress: { address1: string; city: string; zip: string; countryCodeV2: string; company: string | null } | null;
    vatId: { value: string } | null;
  } | null = null;

  try {
    const customerResponse = await admin.graphql(
      `#graphql
        query dealer($id: ID!) {
          customer(id: $id) {
            id
            displayName
            email
            defaultAddress { address1 city zip countryCodeV2 company }
            vatId: metafield(namespace: "${NS}", key: "vat_id") { value }
          }
        }`,
      { variables: { id: customerId } },
    );
    const customerData = await customerResponse.json();
    customer = customerData.data?.customer ?? null;
  } catch (fehler) {
    return { error: "Kunde konnte nicht geladen werden: " + beschreibe(fehler) };
  }

  // Passiert, wenn jemand den Kunden gelöscht hat, während die Liste noch
  // offen war. Vorher lief der Code hier in einen Absturz ("Application
  // Error" ohne Meldung), weil customer.defaultAddress auf null zugriff.
  if (!customer) {
    return { error: "Diesen Kunden gibt es nicht mehr. Bitte die Seite neu laden." };
  }

  // 2. B2B-Firma anlegen ---------------------------------------------------
  //
  // companyCreate und companyAssignCustomerAsContact gehören zu Shopify B2B
  // und existieren nur im Plus-Tarif. Auf Basic antwortet die API mit 400,
  // admin.graphql wirft daraufhin, und die ganze Route stürzte ab - die
  // Freigabe war damit auf diesem Tarif grundsätzlich unmöglich.
  //
  // Für den Shop ist die Firma aber nicht das Entscheidende: Preise,
  // Kaufknöpfe und Downloads hängen einzig am Tag dealer-approved. Die
  // Firma ist Zugabe. Deshalb darf sie fehlschlagen, ohne die Freigabe
  // mitzureißen - und wenn der Tarif später wechselt, greift sie von selbst.

  const firmenhinweis = await legeFirmaAn(admin, customerId, customer);

  // 3. Freigeben -----------------------------------------------------------
  //
  // Das ist der Schritt, auf den es ankommt. Er läuft jetzt in jedem Fall.

  try {
    const updateResponse = await admin.graphql(
      `#graphql
        mutation markApproved($input: CustomerInput!) {
          customerUpdate(input: $input) {
            userErrors { field message }
          }
        }`,
      {
        variables: {
          input: {
            id: customerId,
            tags: ["dealer-approved"],
            metafields: [
              { namespace: NS, key: "dealer_status", type: "single_line_text_field", value: "approved" },
            ],
          },
        },
      },
    );
    const updateData = await updateResponse.json();
    const updateErrors = updateData.data?.customerUpdate?.userErrors ?? [];
    if (updateErrors.length > 0) {
      return { error: updateErrors.map((e: { message: string }) => e.message).join("; ") };
    }
  } catch (fehler) {
    return { error: "Freigabe fehlgeschlagen: " + beschreibe(fehler) };
  }

  return { success: true, hinweis: firmenhinweis };
};

/**
 * Fehler lesbar machen.
 *
 * admin.graphql wirft bei einer 4xx-Antwort ein Response-Objekt, kein Error.
 * Ohne diese Unterscheidung stünde in der Meldung nur "[object Object]".
 */
async function beschreibeAntwort(antwort: Response): Promise<string> {
  try {
    const text = await antwort.text();
    return antwort.status + " " + text.slice(0, 300);
  } catch {
    return String(antwort.status);
  }
}

function beschreibe(fehler: unknown): string {
  if (fehler instanceof Error) return fehler.message;
  if (typeof fehler === "object" && fehler !== null && "status" in fehler) {
    return "HTTP " + (fehler as { status: number }).status;
  }
  return String(fehler);
}

/**
 * Firma, Standort und Ansprechpartner anlegen.
 *
 * Gibt einen Hinweistext zurück, wenn etwas nicht geklappt hat - und wirft
 * nie. Die Freigabe selbst hängt nicht davon ab.
 */
async function legeFirmaAn(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  customerId: string,
  customer: {
    displayName: string;
    defaultAddress: { address1: string; city: string; zip: string; countryCodeV2: string; company: string | null } | null;
    vatId: { value: string } | null;
  },
): Promise<string | null> {
  const address = customer.defaultAddress;

  try {
    const companyResponse = await admin.graphql(
      `#graphql
        mutation createCompany($input: CompanyCreateInput!) {
          companyCreate(input: $input) {
            company {
              id
              defaultRole { id }
              locations(first: 1) { nodes { id } }
            }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          input: {
            // Der Firmenname aus der Adresse, nicht der Personenname. Vorher
            // hiess jede Firma wie ihr Ansprechpartner.
            company: { name: address?.company || customer.displayName },
            companyLocation: {
              name: "Hauptstandort",
              billingSameAsShipping: true,
              taxRegistrationId: customer.vatId?.value || undefined,
              shippingAddress: address
                ? {
                    address1: address.address1,
                    city: address.city,
                    zip: address.zip,
                    countryCode: address.countryCodeV2,
                  }
                : undefined,
            },
          },
        },
      },
    );

    const companyData = (await companyResponse.json()) as {
      data?: {
        companyCreate?: {
          company: { id: string; defaultRole: { id: string } | null; locations: { nodes: { id: string }[] } } | null;
          userErrors: { field: string; message: string }[];
        };
      };
      errors?: { message: string }[];
    };

    if (companyData.errors?.length) {
      return "Firma nicht angelegt: " + companyData.errors.map((e) => e.message).join("; ");
    }

    const companyErrors = companyData.data?.companyCreate?.userErrors ?? [];
    if (companyErrors.length > 0) {
      return "Firma nicht angelegt: " + companyErrors.map((e) => e.message).join("; ");
    }

    const company = companyData.data?.companyCreate?.company;
    if (!company) {
      return "Firma nicht angelegt: Shopify B2B steht auf diesem Tarif nicht zur Verfügung.";
    }

    const locationId = company.locations.nodes[0]?.id;

    const assignResponse = await admin.graphql(
      `#graphql
        mutation assignContact($companyId: ID!, $customerId: ID!) {
          companyAssignCustomerAsContact(companyId: $companyId, customerId: $customerId) {
            companyContact { id }
            userErrors { field message }
          }
        }`,
      { variables: { companyId: company.id, customerId } },
    );
    const assignData = await assignResponse.json();
    const assignErrors = assignData.data?.companyAssignCustomerAsContact?.userErrors ?? [];
    if (assignErrors.length > 0) {
      return "Firma angelegt, Ansprechpartner nicht zugeordnet: " + assignErrors.map((e: { message: string }) => e.message).join("; ");
    }

    const companyContactId = assignData.data?.companyAssignCustomerAsContact?.companyContact?.id;
    if (!companyContactId) {
      return "Firma angelegt, Ansprechpartner nicht zugeordnet.";
    }

    if (locationId && company.defaultRole?.id) {
      try {
        await admin.graphql(
          `#graphql
            mutation assignRole($companyContactId: ID!, $rolesToAssign: [CompanyContactRoleAssign!]!) {
              companyContactAssignRoles(companyContactId: $companyContactId, rolesToAssign: $rolesToAssign) {
                userErrors { field message }
              }
            }`,
          {
            variables: {
              companyContactId,
              rolesToAssign: [{ companyContactRoleId: company.defaultRole.id, companyLocationId: locationId }],
            },
          },
        );
      } catch {
        // Bestellrechte sind Zugabe, kein Grund zur Meldung.
      }
    }

    try {
      await admin.graphql(
        `#graphql
          mutation sendWelcome($companyContactId: ID!) {
            companyContactSendWelcomeEmail(companyContactId: $companyContactId) {
              userErrors { field message }
            }
          }`,
        { variables: { companyContactId } },
      );
    } catch {
      // Willkommensmail ebenfalls Zugabe.
    }

    return null;
  } catch (fehler) {
    if (fehler instanceof Response) {
      return "Firma nicht angelegt: " + (await beschreibeAntwort(fehler));
    }
    return "Firma nicht angelegt: " + beschreibe(fehler);
  }
}

export default function Dealers() {
  const { dealers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      // Der Tag ist gesetzt - das ist die Freigabe. Der Hinweis kommt nur
      // dazu, wenn die B2B-Firma nicht angelegt werden konnte; auf dem
      // Basic-Tarif ist das der Normalfall.
      const hinweis = (fetcher.data as { hinweis?: string | null }).hinweis;
      shopify.toast.show(hinweis ? "Händler freigegeben. " + hinweis : "Händler freigegeben");
    } else if (fetcher.data && "error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const approve = (customerId: string) =>
    fetcher.submit({ customerId }, { method: "POST" });

  return (
    <s-page heading="Händleranfragen">
      <s-section heading={`Ausstehend (${dealers.length})`}>
        {dealers.length === 0 ? (
          <s-paragraph>Keine offenen Händleranfragen.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {dealers.map((dealer) => {
              const isSubmitting =
                fetcher.state !== "idle" &&
                fetcher.formData?.get("customerId") === dealer.id;
              return (
                <s-box
                  key={dealer.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small">
                    <s-heading>
                      {dealer.defaultAddress?.company || dealer.displayName}
                    </s-heading>
                    <s-paragraph>
                      {dealer.displayName} · {dealer.email} · {dealer.phone}
                    </s-paragraph>
                    <s-paragraph>
                      {dealer.defaultAddress?.address1}, {dealer.defaultAddress?.zip}{" "}
                      {dealer.defaultAddress?.city}, {dealer.defaultAddress?.country}
                    </s-paragraph>
                    <s-paragraph>USt-ID: {dealer.vatId?.value || "–"}</s-paragraph>
                    {dealer.registrationMessage?.value && (
                      <s-paragraph>
                        Nachricht: {dealer.registrationMessage.value}
                      </s-paragraph>
                    )}
                    <s-button
                      onClick={() => approve(dealer.id)}
                      {...(isSubmitting ? { loading: true } : {})}
                    >
                      Freigeben
                    </s-button>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
