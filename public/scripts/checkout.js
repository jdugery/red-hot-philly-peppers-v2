const UNTRACKED_SHIPPING_CENTS = 195;
const TRACKED_SHIPPING_CENTS = 495;
const INTERNATIONAL_SHIPPING_CENTS = 749;
const TRACKING_REQUIRED_AT_CENTS = 2500;

function shippingFor(cart) {
  const subtotalCents = Math.round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100);
  const tracked = document.querySelector('input[name="shippingMethod"][value="tracked"]');
  const untracked = document.querySelector('input[name="shippingMethod"][value="untracked"]');
  const international = document.querySelector('input[name="shippingMethod"][value="international"]');
  const country = document.querySelector('input[name="country"]');
  const countryCode = country instanceof HTMLInputElement ? country.value.trim().toUpperCase() : "US";
  if (countryCode && countryCode !== "US" && international instanceof HTMLInputElement) {
    international.disabled = false;
    international.checked = true;
    if (tracked instanceof HTMLInputElement) tracked.disabled = true;
    if (untracked instanceof HTMLInputElement) untracked.disabled = true;
    return INTERNATIONAL_SHIPPING_CENTS;
  }
  if (international instanceof HTMLInputElement) {
    international.disabled = true;
    if (international.checked && untracked instanceof HTMLInputElement) untracked.checked = true;
  }
  if (subtotalCents >= TRACKING_REQUIRED_AT_CENTS && tracked instanceof HTMLInputElement && untracked instanceof HTMLInputElement) {
    tracked.checked = true;
    untracked.disabled = true;
  } else if (untracked instanceof HTMLInputElement) {
    untracked.disabled = false;
  }
  return tracked instanceof HTMLInputElement && tracked.checked ? TRACKED_SHIPPING_CENTS : UNTRACKED_SHIPPING_CENTS;
}

function paTaxRate() {
  const country = document.querySelector('input[name="country"]');
  const state = document.querySelector('input[name="state"]');
  const county = document.querySelector('input[name="county"]');
  if (!(country instanceof HTMLInputElement) || country.value.trim().toUpperCase() !== "US" || !(state instanceof HTMLInputElement) || state.value.trim().toUpperCase() !== "PA") return 0;
  const normalizedCounty = county instanceof HTMLInputElement ? county.value.trim().toLowerCase().replace(/\s+county$/, "") : "";
  if (normalizedCounty === "philadelphia") return 8;
  if (normalizedCounty === "allegheny") return 7;
  return 6;
}

function showMessage(message, success = false) {
  const node = document.querySelector("#checkout-message");
  if (!(node instanceof HTMLElement)) return;
  node.hidden = false;
  node.textContent = message;
  node.classList.toggle("success", success);
}

function renderSummary(cart, money) {
  const items = document.querySelector("#checkout-items");
  const empty = document.querySelector("#checkout-empty");
  const totals = document.querySelector("#checkout-totals");
  if (!(items instanceof HTMLElement) || !(empty instanceof HTMLElement) || !(totals instanceof HTMLElement)) return;
  items.replaceChildren();
  empty.hidden = cart.length > 0;
  totals.hidden = cart.length === 0;
  for (const item of cart) {
    const line = document.createElement("div");
    line.className = "checkout-line";
    line.innerHTML = "<p></p><span></span><strong></strong>";
    line.querySelector("p").textContent = `${item.quantity} × ${item.name}`;
    line.querySelector("span").textContent = item.isolated ? "Isolated seed packet" : "Standard seed packet";
    line.querySelector("strong").textContent = money(item.unitPrice * item.quantity);
    items.append(line);
  }
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const subtotalCents = Math.round(subtotal * 100);
  document.querySelector("#checkout-subtotal").textContent = money(subtotal);
  const shippingCents = shippingFor(cart);
  const taxCents = Math.round((subtotalCents + shippingCents) * paTaxRate() / 100);
  document.querySelector("#checkout-shipping").textContent = money(shippingCents / 100);
  document.querySelector("#checkout-tax").textContent = money(taxCents / 100);
  document.querySelector("#checkout-total").textContent = money((subtotalCents + shippingCents + taxCents) / 100);
}

async function initialize() {
  const cartApi = window.RHPP_CART;
  const checkoutPage = document.querySelector(".checkout-page");
  const form = document.querySelector("#checkout-form");
  const button = document.querySelector("#place-order-button");
  if (!cartApi || !(checkoutPage instanceof HTMLElement) || !(form instanceof HTMLFormElement) || !(button instanceof HTMLButtonElement)) return;
  const production = checkoutPage.dataset.squareEnvironment === "production";

  const cart = cartApi.read();
  renderSummary(cart, cartApi.money);
  for (const option of document.querySelectorAll('input[name="shippingMethod"], input[name="country"], input[name="state"], input[name="county"]')) {
    option.addEventListener("change", () => renderSummary(cartApi.read(), cartApi.money));
    option.addEventListener("input", () => renderSummary(cartApi.read(), cartApi.money));
  }
  if (cart.length === 0) return;

  if (!window.Square) {
    showMessage("Square's secure payment form could not load. Please refresh and try again.");
    return;
  }

  try {
    const payments = window.Square.payments(checkoutPage.dataset.squareApplicationId, checkoutPage.dataset.squareLocationId);
    const card = await payments.card();
    await card.attach("#card-container");
    button.disabled = false;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      button.textContent = production ? "Processing order…" : "Processing test order…";
      try {
        const tokenResult = await card.tokenize();
        if (tokenResult.status !== "OK") throw new Error(tokenResult.errors?.[0]?.message || "Card details could not be verified.");
        const fields = Object.fromEntries(new FormData(form).entries());
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: tokenResult.token, cart: cartApi.read(), customer: fields }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Square could not process the test order.");
        cartApi.write([]);
        renderSummary([], cartApi.money);
        form.reset();
        showMessage(production ? `Order complete. Square payment ${result.paymentId} was approved.` : `Test order complete. Square payment ${result.paymentId} was approved in Sandbox.`, true);
        button.textContent = production ? "Order complete" : "Test order complete";
      } catch (error) {
        showMessage(error instanceof Error ? error.message : "The test order could not be completed.");
        button.disabled = false;
        button.textContent = production ? "Place order" : "Place test order";
      }
    });
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Square checkout could not be initialized.");
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
else initialize();
