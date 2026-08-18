import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { env } from "cloudflare:workers";

export const prerender = false;

const SANDBOX_LOCATION_ID = "LR809HXY3TYB8";
const PRODUCTION_LOCATION_ID = "L53B3P55TJJ5M";
const SHIPPING_CENTS = 400;
const SQUARE_VERSION = "2026-07-15";
const COLLECTIONS = ["peppers", "tomatoes", "tobacco"] as const;

type CollectionName = (typeof COLLECTIONS)[number];
type CartInput = { productId: string; collection: CollectionName; isolated: boolean; quantity: number };
type ProductData = {
  name: string;
  available: boolean;
  seedPrice?: number;
  isolatedAvailable: boolean;
  isolatedPrice?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function squareRequest(path: string, accessToken: string, body: unknown, production: boolean) {
  const host = production ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
  const response = await fetch(`${host}/v2${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Record<string, any>;
  if (!response.ok) {
    const detail = result.errors?.[0]?.detail || "Square rejected the request.";
    throw new Error(detail);
  }
  return result;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const production = env.SQUARE_ENV === "production";
    const locationId = production ? PRODUCTION_LOCATION_ID : SANDBOX_LOCATION_ID;
    const accessToken = env.SQUARE_ACCESS_TOKEN;
    if (!accessToken) return json({ error: `Square ${production ? "Production" : "Sandbox"} has not been connected yet.` }, 503);

    const input = await request.json() as Record<string, any>;
    const sourceId = clean(input.sourceId, 300);
    const rawCart = Array.isArray(input.cart) ? input.cart : [];
    const customer = input.customer || {};
    if (!sourceId || rawCart.length === 0 || rawCart.length > 30) return json({ error: "The cart or payment token is invalid." }, 400);

    const catalogs = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (name) => [name, await getCollection(name)]))) as Record<CollectionName, Awaited<ReturnType<typeof getCollection>>>;
    const lineItems = [];

    for (const raw of rawCart) {
      const item = raw as CartInput;
      if (!COLLECTIONS.includes(item.collection) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
        return json({ error: "A cart item is invalid." }, 400);
      }
      const entry = catalogs[item.collection].find((candidate) => candidate.id === clean(item.productId, 100));
      const product = entry?.data as ProductData | undefined;
      if (!entry || !product?.available || typeof product.seedPrice !== "number") return json({ error: "A seed packet is no longer available." }, 409);
      const isolated = Boolean(item.isolated && product.isolatedAvailable && typeof product.isolatedPrice === "number");
      const unitPrice = product.seedPrice + (isolated ? product.isolatedPrice! : 0);
      lineItems.push({
        name: `${product.name} — ${isolated ? "Isolated" : "Standard"} seed packet`,
        quantity: String(item.quantity),
        base_price_money: { amount: Math.round(unitPrice * 100), currency: "USD" },
      });
    }

    lineItems.push({ name: "Seed packet shipping", quantity: "1", base_price_money: { amount: SHIPPING_CENTS, currency: "USD" } });
    const email = clean(customer.email, 254);
    const phone = clean(customer.phone, 30);
    const fullName = clean(customer.name);
    const addressLine1 = clean(customer.addressLine1);
    const city = clean(customer.city);
    const state = clean(customer.state, 2).toUpperCase();
    const postalCode = clean(customer.postalCode, 12);
    if (!email || !phone || !fullName || !addressLine1 || !city || !/^[A-Z]{2}$/.test(state) || !postalCode) {
      return json({ error: "Please complete the contact and shipping address fields." }, 400);
    }

    const idempotencyKey = crypto.randomUUID();
    const orderResult = await squareRequest("/orders", accessToken, {
      idempotency_key: idempotencyKey,
      order: {
        location_id: locationId,
        line_items: lineItems,
        fulfillments: [{
          type: "SHIPMENT",
          state: "PROPOSED",
          shipment_details: {
            recipient: {
              display_name: fullName,
              email_address: email,
              phone_number: phone,
              address: {
                address_line_1: addressLine1,
                ...(clean(customer.addressLine2) ? { address_line_2: clean(customer.addressLine2) } : {}),
                locality: city,
                administrative_district_level_1: state,
                postal_code: postalCode,
                country: "US",
              },
            },
          },
        }],
      },
    }, production);

    const order = orderResult.order;
    const paymentResult = await squareRequest("/payments", accessToken, {
      source_id: sourceId,
      idempotency_key: crypto.randomUUID(),
      amount_money: order.total_money,
      order_id: order.id,
      location_id: locationId,
      buyer_email_address: email,
      autocomplete: true,
      note: `Red Hot Philly Peppers website ${production ? "production" : "Sandbox"} checkout`,
    }, production);

    return json({ paymentId: paymentResult.payment.id, orderId: order.id, status: paymentResult.payment.status });
  } catch (error) {
    console.error("Square checkout failed", error);
    return json({ error: error instanceof Error ? error.message : "The test order could not be completed." }, 500);
  }
};
